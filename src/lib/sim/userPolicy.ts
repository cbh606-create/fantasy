import type { CategoryId, Player } from "@/lib/domain/types"
import {
  categoryWinExpectancies,
  leagueMeanTotals,
  rosterTotals,
} from "@/lib/sim/score"

type CategoryWeights = Record<CategoryId, number>

export const USER_PICK_TOP_K = 8
export const USER_PICK_SOFTMAX_TAU = 0.08

const scorePlayer = (
  player: Player,
  userRoster: Player[],
  allRosters: Player[][],
  weights: CategoryWeights,
): number => {
  const leagueMean = leagueMeanTotals(allRosters)

  return categoryWinExpectancies(
    rosterTotals([...userRoster, player]),
    leagueMean,
    weights,
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

  const scored = remaining.map((player) => ({
    player,
    score: scorePlayer(player, userRoster, allRosters, weights),
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
    score: scorePlayer(player, userRoster, allRosters, weights),
  }
}
