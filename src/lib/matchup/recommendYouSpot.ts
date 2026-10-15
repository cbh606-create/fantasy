import { applyStreamingPlanPreview } from "./applyStreamingPlanPreview"
import type { DailyLineups } from "./dailyLineups"
import { countTeamStarts } from "./streamingHoleCalendar"
import { projectedCatWinsFromDaily } from "./streamerMove"
import type { MatchupBoard, StatWindow, StreamingPlan } from "./types"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

export type YouSpotCount = 1 | 2 | 3 | null

export type YouSpotScore = {
  spot: YouSpotCount
  gameStarts: number
  addsUsed: number
  projectedCatWins: number
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
    if (right.projectedCatWins !== left.projectedCatWins) {
      return right.projectedCatWins - left.projectedCatWins
    }
    if (left.addsUsed !== right.addsUsed) {
      return left.addsUsed - right.addsUsed
    }
    return spotRank(left.spot) - spotRank(right.spot)
  })[0]?.spot
}

export const scoreYouSpotPlans = ({
  plans,
  noneOpponentDaily,
  baseDaily,
  players,
  schedule,
  board,
  statWindow,
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
  const oppDaily =
    Object.keys(noneOpponentDaily).length > 0 ? noneOpponentDaily : undefined
  const scoreDaily = (daily: DailyLineups, addsUsed: number, spot: YouSpotCount): YouSpotScore => ({
    spot,
    gameStarts: countTeamStarts(daily, players, schedule),
    addsUsed,
    projectedCatWins: projectedCatWinsFromDaily(
      daily,
      players,
      schedule,
      board,
      oppDaily,
      statWindow,
    ),
  })
  const noneScore = scoreDaily(baseDaily, 0, null)
  const planScores = plans.map((plan) =>
    scoreDaily(
      applyStreamingPlanPreview(baseDaily, plan, playersById, schedule),
      plan.addsUsed,
      plan.spotCount,
    ),
  )
  return [noneScore, ...planScores]
}
