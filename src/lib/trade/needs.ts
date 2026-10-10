import type { CategoryId } from "@/lib/domain/types"
import type { SeasonAnalysis } from "@/lib/season/analysis"
import { NEED_RANK_FLOOR, SURPLUS_RANK_CEILING } from "./constants"

export const teamNeedsAndSurplus = (
  analysis: SeasonAnalysis,
  teamIndex: number,
): { need: CategoryId[]; surplus: CategoryId[] } => {
  const need: CategoryId[] = []
  const surplus: CategoryId[] = []

  for (const category of analysis.byCategory) {
    const row = category.rows.find(
      (candidate) => candidate.teamIndex === teamIndex,
    )

    if (!row) {
      continue
    }

    if (row.rank >= NEED_RANK_FLOOR) {
      need.push(category.categoryId)
    }

    if (row.rank <= SURPLUS_RANK_CEILING) {
      surplus.push(category.categoryId)
    }
  }

  return { need, surplus }
}

export const needsScore = (
  analysis: SeasonAnalysis,
  teamIndex: number,
  needCats: CategoryId[],
): number => {
  if (needCats.length === 0) {
    return 0
  }

  const scores = needCats.flatMap((categoryId) => {
    const category = analysis.byCategory.find(
      (candidate) => candidate.categoryId === categoryId,
    )
    const row = category?.rows.find(
      (candidate) => candidate.teamIndex === teamIndex,
    )

    return row ? [13 - row.rank] : []
  })

  if (scores.length === 0) {
    return 0
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}
