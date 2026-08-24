import type { CategoryId, Player } from "@/lib/domain/types"
import {
  categoryWinExpectancies,
  leagueMeanTotals,
  rosterTotals,
} from "@/lib/sim/score"

type CategoryWeights = Record<CategoryId, number>

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

  let bestScore = Number.NEGATIVE_INFINITY
  let bestPlayers: Player[] = []

  for (const player of remaining) {
    const score = scorePlayer(player, userRoster, allRosters, weights)

    if (score > bestScore) {
      bestScore = score
      bestPlayers = [player]
      continue
    }

    if (score === bestScore) {
      bestPlayers.push(player)
    }
  }

  const selectedIndex = Math.min(
    Math.floor(rng() * bestPlayers.length),
    bestPlayers.length - 1,
  )

  return bestPlayers[selectedIndex]
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
