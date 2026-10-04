import { readFileSync } from "node:fs"
import path from "node:path"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { ScheduleResponse, SeasonLeagueState } from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import {
  b2bSecondNightsThisWeekByPlayerId,
  gamesThisWeekByPlayerId,
  weightedGamesThisWeekByPlayerId,
} from "./games"
import {
  blendedMatchupBoard,
  blendWeekTotals,
  buildMorningSummary,
  closeFinishedDays,
  dayComparisonRows,
  outcomesFromBoard,
  type DayActuals,
  type DayComparisonRow,
  type MorningSummary,
} from "./morningCheck"
import type { MorningCheckRecord } from "./morningCheckStore"
import { suggestSitStart } from "./sitStart"
import { suggestStreamers } from "./streamers"
import { buildAdpByPlayerIdFromProjPool } from "./streamingDropPolicy"
import { buildAllStreamingPlans } from "./streamingPlans"
import type {
  MatchupAdvice,
  StatWindow,
  StreamingPlan,
  WinnerStreamRecipe,
} from "./types"
import { activeTeamWeeklyTotals } from "./weekly"

type ProjAdpPlayer = {
  id: string
  name: string
  teamAbbr?: string
  adp?: number
}

export type MorningAdviceInput = {
  today: string
  actualsByDate: Map<string, DayActuals>
  previous: MorningCheckRecord | null
  outPlayerIds: string[]
  spotCount?: 1 | 2 | 3
}

export type MorningMatchupAdvice = MatchupAdvice & {
  morningSummary?: MorningSummary
  dayComparison?: DayComparisonRow[]
  nextMorningCheck?: MorningCheckRecord
}

let cachedProjAdpPlayers: ProjAdpPlayer[] | undefined

const loadProjAdpPlayers = (): ProjAdpPlayer[] => {
  if (cachedProjAdpPlayers) return cachedProjAdpPlayers
  const parsed = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "data", "players", "proj_2026_27.json"),
      "utf8",
    ),
  ) as { players?: ProjAdpPlayer[] }
  cachedProjAdpPlayers = parsed.players ?? []
  return cachedProjAdpPlayers
}

const enabledCategoryIds = (state: SeasonLeagueState): CategoryId[] => {
  const enabled = state.categories.filter((category) => category.enabled).map((category) => category.id)
  return enabled.length > 0 ? enabled : ALL_CATEGORY_IDS
}

const scheduleFromDate = (
  schedule: ScheduleResponse,
  today: string,
): ScheduleResponse => ({
  ...schedule,
  matchup: {
    ...schedule.matchup,
    days: schedule.matchup.days.filter((date) => date >= today),
  },
  games: schedule.games.filter((game) => game.date >= today),
})

export const adviseMatchup = (
  state: SeasonLeagueState,
  schedule: ScheduleResponse,
  opponentTeamIndex: number,
  options: {
    addLimit?: number
    winnerStreamRecipes?: WinnerStreamRecipe[]
    statWindow?: StatWindow
    morning?: MorningAdviceInput
  } = {},
): MorningMatchupAdvice | { error: string } => {
  if (opponentTeamIndex === state.perspectiveTeamIndex) {
    return { error: "invalid_opponent" }
  }

  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const oppTeam = state.teams.find((team) => team.teamIndex === opponentTeamIndex)

  if (!youTeam || !oppTeam) {
    return { error: "invalid_opponent" }
  }

  const statWindow = options.statWindow ?? "season"
  const morning = options.morning
  const planSchedule = morning ? scheduleFromDate(schedule, morning.today) : schedule
  const gamesMap = weightedGamesThisWeekByPlayerId(state.players, schedule)
  const planGamesMap = morning
    ? weightedGamesThisWeekByPlayerId(state.players, planSchedule)
    : gamesMap
  const streamerGamesMap = gamesThisWeekByPlayerId(state.players, schedule)
  const streamerB2bMap = b2bSecondNightsThisWeekByPlayerId(state.players, schedule)
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const categoryIds = enabledCategoryIds(state)

  const finished = morning
    ? closeFinishedDays({
        matchupDays: schedule.matchup.days,
        today: morning.today,
        previousClosed: morning.previous?.closedDays ?? [],
        actualsByDate: morning.actualsByDate,
        schedule,
        youEntries: youTeam.entries,
        oppEntries: oppTeam.entries,
        playersById,
      })
    : null

  const board = morning && finished
    ? blendedMatchupBoard(
        blendWeekTotals({
          closedDays: finished.closedDays,
          remainingDates: schedule.matchup.days.filter(
            (date) => date >= morning.today,
          ),
          youEntries: youTeam.entries,
          oppEntries: oppTeam.entries,
          playersById,
          schedule,
          statWindow,
        }),
        categoryIds,
      )
    : buildMatchupBoard(
        activeTeamWeeklyTotals(youTeam.entries, playersById, gamesMap, statWindow),
        activeTeamWeeklyTotals(oppTeam.entries, playersById, gamesMap, statWindow),
        categoryIds,
      )

  const sitStart = suggestSitStart({
    youEntries: youTeam.entries,
    oppEntries: oppTeam.entries,
    players: state.players,
    gamesMap: planGamesMap,
    categoryIds,
    statWindow,
  })

  // Streamers: integer game-days + separate B2B count (not 0.75 weighting).
  const streamers = suggestStreamers({
    state,
    board,
    gamesMap: streamerGamesMap,
    b2bMap: streamerB2bMap,
    recipes: options.winnerStreamRecipes,
    statWindow,
  })

  const adpByPlayerId = buildAdpByPlayerIdFromProjPool(
    state.players,
    loadProjAdpPlayers(),
  )
  let streamingPlans: StreamingPlan[]
  try {
    streamingPlans = buildAllStreamingPlans({
      state,
      schedule: planSchedule,
      board,
      addLimit: options.addLimit,
      adpByPlayerId,
      winnerStreamRecipes: options.winnerStreamRecipes,
      statWindow,
    })
  } catch {
    streamingPlans = []
  }

  const advice: MatchupAdvice = {
    opponentTeamIndex,
    scoringPeriod: schedule.matchup,
    board,
    sitStart,
    streamers,
    streamingPlans,
    adpByPlayerId,
    winnerStreamRecipes: options.winnerStreamRecipes ?? [],
  }

  if (!morning || !finished) return advice

  const chosenPlan = streamingPlans.find(
    (plan) => plan.spotCount === (morning.spotCount ?? 1),
  )
  const ourDays = chosenPlan?.days ?? []
  const opponentDays = chosenPlan?.opponentDays ?? []
  const opponentRosterIds = oppTeam.entries.flatMap((entry) =>
    entry.playerId ? [entry.playerId] : [],
  )
  const morningSummary = buildMorningSummary({
    board,
    previous: morning.previous?.plan ?? null,
    closedDays: finished.closedDays,
    currentOpponentRosterIds: opponentRosterIds,
    ourDays,
    opponentDays,
    sitStart,
    outPlayerIds: morning.outPlayerIds,
    today: morning.today,
    actualsPending: finished.actualsPending,
  })
  const dayComparison = dayComparisonRows(
    finished.closedDays,
    playersById,
    schedule,
    statWindow,
  )

  return {
    ...advice,
    morningSummary,
    dayComparison,
    nextMorningCheck: {
      matchupStartDate: schedule.matchup.startDate,
      opponentTeamIndex,
      checkedOn: morning.today,
      closedDays: finished.closedDays,
      plan: {
        outcomes: outcomesFromBoard(board),
        opponentRosterIds,
        opponentDays,
        ourDays,
        sitStart,
      },
      actualsPending: finished.actualsPending,
      summary: morningSummary,
      dayComparison,
    },
  }
}
