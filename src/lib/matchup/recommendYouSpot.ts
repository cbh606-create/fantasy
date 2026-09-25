import { applyStreamingPlanPreview } from "./applyStreamingPlanPreview"
import type { DailyLineups } from "./dailyLineups"
import { countTeamStarts } from "./streamingHoleCalendar"
import type { MatchupBoard, StatWindow, StreamingPlan } from "./types"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

export type YouSpotCount = 1 | 2 | 3 | null

export type YouSpotScore = {
  spot: YouSpotCount
  gameStarts: number
  addsUsed: number
}

const spotRank = (spot: YouSpotCount) => (spot == null ? 0 : spot)

export const shouldAutoApplyYouSpot = (
  appliedOppKey: string | null,
  oppAssumptionKey: string,
) => appliedOppKey === null || appliedOppKey !== oppAssumptionKey

export const pickRecommendedYouSpot = (
  scores: readonly YouSpotScore[],
): YouSpotCount | undefined => {
  if (scores.length === 0) return undefined

  return [...scores].sort((left, right) => {
    if (right.gameStarts !== left.gameStarts) {
      return right.gameStarts - left.gameStarts
    }
    if (left.addsUsed !== right.addsUsed) {
      return left.addsUsed - right.addsUsed
    }
    return spotRank(left.spot) - spotRank(right.spot)
  })[0]?.spot
}

export const scoreYouSpotPlans = ({
  plans,
  noneOpponentDaily: _noneOpponentDaily,
  baseDaily,
  players,
  schedule,
  board: _board,
  statWindow: _statWindow,
}: {
  plans: StreamingPlan[]
  noneOpponentDaily: DailyLineups
  baseDaily: DailyLineups
  players: SeasonPlayer[]
  schedule: ScheduleResponse
  board: MatchupBoard
  statWindow?: StatWindow
}): YouSpotScore[] => {
  const playersById = Object.fromEntries(
    players.map((player) => [player.id, player]),
  )
  const noneScore: YouSpotScore = {
    spot: null,
    gameStarts: countTeamStarts(baseDaily, players, schedule),
    addsUsed: 0,
  }
  const planScores = plans.map((plan) => ({
    spot: plan.spotCount,
    gameStarts: countTeamStarts(
      applyStreamingPlanPreview(baseDaily, plan, playersById, schedule),
      players,
      schedule,
    ),
    addsUsed: plan.addsUsed,
  }))
  return [noneScore, ...planScores]
}
