import type { CategoryId, Player } from "@/lib/domain/types"
import { positionNeedBonus } from "@/lib/sim/rosterNeeds"
import {
  categoryWinExpectancies,
  leagueMeanTotals,
  playerPoolStats,
  rosterTotals,
  weightedPlayerZScore,
} from "@/lib/sim/score"

type CategoryWeights = Record<CategoryId, number>

export const USER_PICK_TOP_K = 8
export const USER_PICK_SOFTMAX_TAU = 0.08
export const USER_PICK_POSITION_NEED_SCALE = 1 / 25

const scorePlayer = (
  player: Player,
  userRoster: Player[],
  allRosters: Player[][],
  poolStats: ReturnType<typeof playerPoolStats>,
  weights: CategoryWeights,
): number => {
  // End-of-board style EV vs current league (matters once rosters diverge).
  const categoryScore = categoryWinExpectancies(
    rosterTotals([...userRoster, player]),
    leagueMeanTotals(allRosters),
    weights,
  )

  // Pool-relative talent (matters on empty/early boards where league EV saturates).
  const talentScore = weightedPlayerZScore(player, poolStats, weights)

  return (
    categoryScore +
    talentScore +
    USER_PICK_POSITION_NEED_SCALE * positionNeedBonus(player, userRoster)
  )
}

export const greedyUserPick = (
  remaining: Player[],
  userRoster: Player[],
  allRosters: Player[][],
  weights: CategoryWeights,
  rng: () => number,
): Player => {
  if (remaining.length === 0) {
    throw new RangeError("Cannot pick a user player from an empty pool")
  }

  const poolStats = playerPoolStats(remaining)
  const scored = remaining.map((player) => ({
    player,
    score: scorePlayer(player, userRoster, allRosters, poolStats, weights),
  }))

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return left.player.id.localeCompare(right.player.id)
  })

  const top = scored.slice(0, Math.min(USER_PICK_TOP_K, scored.length))
  const maxScore = top[0].score
  const softmaxWeights = top.map(({ score }) =>
    Math.exp((score - maxScore) / USER_PICK_SOFTMAX_TAU),
  )
  const totalWeight = softmaxWeights.reduce((sum, weight) => sum + weight, 0)
  const threshold = rng() * totalWeight

  let cumulative = 0
  for (let index = 0; index < top.length; index += 1) {
    cumulative += softmaxWeights[index]
    if (threshold < cumulative) {
      return top[index].player
    }
  }

  return top[top.length - 1].player
}

export const evaluateForcePick = (
  forcePick: Player,
  remaining: Player[],
  userRoster: Player[],
  allRosters: Player[][],
  weights: CategoryWeights,
  rng: () => number,
): { player: Player; path: Player[]; score: number } => {
  const poolStats = playerPoolStats(remaining)
  const player = greedyUserPick(
    remaining.filter((candidate) => candidate.id === forcePick.id),
    userRoster,
    allRosters,
    weights,
    rng,
  )

  return {
    player,
    path: [player],
    score: scorePlayer(player, userRoster, allRosters, poolStats, weights),
  }
}
