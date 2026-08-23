import type { CategoryId } from "@/lib/domain/types"

const RATE_CATEGORY_IDS = new Set<CategoryId>(["FG_PCT", "FT_PCT"])

export const formatCategoryStat = (
  categoryId: CategoryId,
  value: number,
): string => {
  if (RATE_CATEGORY_IDS.has(categoryId)) {
    return `${(value * 100).toFixed(2)}%`
  }

  return value.toFixed(1)
}

export const CATEGORY_SHORT_LABELS: Record<CategoryId, string> = {
  FG_PCT: "FG%",
  FT_PCT: "FT%",
  TPM: "3PM",
  REB: "REB",
  AST: "AST",
  STL: "STL",
  BLK: "BLK",
  TO: "TO",
  PTS: "PTS",
}
