import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"

type CategoryTotals = Record<CategoryId, number>

const RATE_CATEGORY_IDS = new Set<CategoryId>(["FG_PCT", "FT_PCT"])
const leagueStandardDeviations = new WeakMap<CategoryTotals, CategoryTotals>()

const emptyTotals = (): CategoryTotals =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryTotals

export const rosterTotals = (players: Player[]): CategoryTotals => {
  const totals = emptyTotals()

  for (const player of players) {
    for (const categoryId of ALL_CATEGORY_IDS) {
      totals[categoryId] += player.projections[categoryId]
    }
  }

  if (players.length === 0) {
    return totals
  }

  for (const categoryId of RATE_CATEGORY_IDS) {
    totals[categoryId] /= players.length
  }

  return totals
}

export const leagueMeanTotals = (rosters: Player[][]): CategoryTotals => {
  const rosterCategoryTotals = rosters.map(rosterTotals)
  const means = emptyTotals()
  const standardDeviations = emptyTotals()

  if (rosterCategoryTotals.length === 0) {
    leagueStandardDeviations.set(means, standardDeviations)
    return means
  }

  for (const categoryId of ALL_CATEGORY_IDS) {
    means[categoryId] =
      rosterCategoryTotals.reduce(
        (sum, totals) => sum + totals[categoryId],
        0,
      ) / rosterCategoryTotals.length

    const variance =
      rosterCategoryTotals.reduce((sum, totals) => {
        const difference = totals[categoryId] - means[categoryId]
        return sum + difference ** 2
      }, 0) / rosterCategoryTotals.length

    standardDeviations[categoryId] = Math.sqrt(variance)
  }

  leagueStandardDeviations.set(means, standardDeviations)
  return means
}

export const categoryWinExpectancies = (
  teamTotals: CategoryTotals,
  leagueMeans: CategoryTotals,
  weights: CategoryTotals,
): number => {
  const standardDeviations = leagueStandardDeviations.get(leagueMeans)

  return ALL_CATEGORY_IDS.reduce((score, categoryId) => {
    const standardDeviation = standardDeviations?.[categoryId] || 1
    const difference =
      categoryId === "TO"
        ? leagueMeans[categoryId] - teamTotals[categoryId]
        : teamTotals[categoryId] - leagueMeans[categoryId]
    const zScore = difference / standardDeviation
    const winExpectancy = 1 / (1 + Math.exp(-zScore))

    return score + weights[categoryId] * winExpectancy
  }, 0)
}
