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

export const categoryStatLead = (
  categoryId: CategoryId,
  you: number,
  opp: number,
): number => (categoryId === "TO" ? opp - you : you - opp)

export const formatCategoryStatDelta = (
  categoryId: CategoryId,
  delta: number,
): string => {
  const formatted = formatCategoryStat(categoryId, Math.abs(delta))
  if (delta > 0) return `+${formatted}`
  if (delta < 0) return `-${formatted}`
  return formatted
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
