import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export const overallPlaces = (
  rows: { teamIndex: number, ranks: Record<CategoryId, number> }[],
) => {
  const withSums = rows.map((row) => ({
    teamIndex: row.teamIndex,
    rankSum: ALL_CATEGORY_IDS.reduce(
      (sum, categoryId) => sum + row.ranks[categoryId],
      0,
    ),
  }))
  const ordered = [...withSums].sort((left, right) =>
    left.rankSum - right.rankSum || left.teamIndex - right.teamIndex)

  return ordered.map((row, index) => ({ ...row, rank: index + 1 }))
}
