import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { MATCHUP_CATEGORY_SIGMOID_SCALE } from "./constants"
import type { CategoryOutcome, MatchupBoard } from "./types"

export const categoryWinProb = (
  you: number,
  opp: number,
  categoryId: CategoryId,
): number => {
  const delta = categoryId === "TO" ? opp - you : you - opp
  const scale = MATCHUP_CATEGORY_SIGMOID_SCALE[categoryId]
  return 1 / (1 + Math.exp(-delta / scale))
}

const categoryOutcome = (
  you: number,
  opp: number,
  categoryId: CategoryId,
): CategoryOutcome => {
  const delta = categoryId === "TO" ? opp - you : you - opp
  if (delta > 0) return "W"
  if (delta < 0) return "L"
  return "T"
}

export const buildMatchupBoard = (
  youTotals: Record<CategoryId, number>,
  oppTotals: Record<CategoryId, number>,
  categoryIds: CategoryId[] = ALL_CATEGORY_IDS,
): MatchupBoard => {
  let wins = 0
  let losses = 0
  let ties = 0
  let projectedCatWins = 0

  const categories = categoryIds.map((categoryId) => {
    const you = youTotals[categoryId]
    const opp = oppTotals[categoryId]
    const outcome = categoryOutcome(you, opp, categoryId)
    const winProb = categoryWinProb(you, opp, categoryId)

    if (outcome === "W") wins++
    else if (outcome === "L") losses++
    else ties++

    projectedCatWins += winProb

    return { categoryId, you, opp, outcome, winProb }
  })

  return { categories, wins, losses, ties, projectedCatWins }
}
