import type { SeasonLeagueState, SeasonPlayer, ScheduleResponse } from "@/lib/season/types"
import { initDailyLineups } from "./dailyLineups"
import { rosterSlotsFor } from "./eligibility"
import { streamingAddLimitForSchedule } from "./games"
import { countTeamStarts } from "./streamingHoleCalendar"
import { buildStreamingPlan } from "./streamingPlans"
import type { MatchupBoard, StatWindow, WinnerStreamRecipe } from "./types"

export type OppSpotScore = {
  spot: 0 | 1 | 2 | 3
  gameStarts: number
}

export const scoreOppSpotPlans = ({
  state,
  schedule,
  board,
  opponentTeamIndex,
  players,
  forcedOpponentRosterDrops,
  today,
  addLimit,
  winnerStreamRecipes,
  statWindow,
  adpByPlayerId,
}: {
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  opponentTeamIndex: number
  players: SeasonPlayer[]
  forcedOpponentRosterDrops?: (string | null)[]
  today?: string
  addLimit?: number
  winnerStreamRecipes?: WinnerStreamRecipe[]
  statWindow?: StatWindow
  adpByPlayerId?: Record<string, number>
}): OppSpotScore[] => {
  const oppTeam = state.teams.find((team) => team.teamIndex === opponentTeamIndex)
  if (!oppTeam) return []

  const rosterSlots = rosterSlotsFor(state)
  const limit = addLimit ?? streamingAddLimitForSchedule(schedule)
  const baseDaily = initDailyLineups(
    schedule.matchup.days,
    oppTeam.entries,
    rosterSlots,
    players,
    schedule,
  )
  const scores: OppSpotScore[] = [
    {
      spot: 0,
      gameStarts: countTeamStarts(baseDaily, players, schedule),
    },
  ]

  for (const spots of [1, 2, 3] as const) {
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: limit,
      youIdle: true,
      oppSpotCount: spots,
      opponentTeamIndex,
      ...(forcedOpponentRosterDrops
        ? { forcedOpponentRosterDrops }
        : {}),
      ...(today ? { today } : {}),
      ...(winnerStreamRecipes ? { winnerStreamRecipes } : {}),
      ...(statWindow ? { statWindow } : {}),
      ...(adpByPlayerId ? { adpByPlayerId } : {}),
    })
    scores.push({
      spot: spots,
      gameStarts: countTeamStarts(
        plan.opponentDaily,
        players,
        schedule,
      ),
    })
  }

  return scores
}
