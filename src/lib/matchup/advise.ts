import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { ScheduleResponse, SeasonLeagueState } from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import {
  b2bSecondNightsThisWeekByPlayerId,
  gamesThisWeekByPlayerId,
  weightedGamesThisWeekByPlayerId,
} from "./games"
import { suggestSitStart } from "./sitStart"
import { suggestStreamers } from "./streamers"
import { buildAllStreamingPlans } from "./streamingPlans"
import type { MatchupAdvice } from "./types"
import { activeTeamWeeklyTotals } from "./weekly"

const enabledCategoryIds = (state: SeasonLeagueState): CategoryId[] => {
  const enabled = state.categories.filter((category) => category.enabled).map((category) => category.id)
  return enabled.length > 0 ? enabled : ALL_CATEGORY_IDS
}

export const adviseMatchup = (
  state: SeasonLeagueState,
  schedule: ScheduleResponse,
  opponentTeamIndex: number,
): MatchupAdvice | { error: string } => {
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

  const gamesMap = weightedGamesThisWeekByPlayerId(state.players, schedule)
  const streamerGamesMap = gamesThisWeekByPlayerId(state.players, schedule)
  const streamerB2bMap = b2bSecondNightsThisWeekByPlayerId(state.players, schedule)
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const categoryIds = enabledCategoryIds(state)

  const youTotals = activeTeamWeeklyTotals(youTeam.entries, playersById, gamesMap)
  const oppTotals = activeTeamWeeklyTotals(oppTeam.entries, playersById, gamesMap)
  const board = buildMatchupBoard(youTotals, oppTotals, categoryIds)

  const sitStart = suggestSitStart({
    youEntries: youTeam.entries,
    oppEntries: oppTeam.entries,
    players: state.players,
    gamesMap,
    categoryIds,
  })

  // Streamers: integer game-days + separate B2B count (not 0.75 weighting).
  const streamers = suggestStreamers({
    state,
    board,
    gamesMap: streamerGamesMap,
    b2bMap: streamerB2bMap,
  })

  const streamingPlans = buildAllStreamingPlans({ state, schedule, board })

  return {
    opponentTeamIndex,
    scoringPeriod: schedule.matchup,
    board,
    sitStart,
    streamers,
    streamingPlans,
  }
}
