import type { CategoryId, CategorySetting } from "./types"

export const ALL_CATEGORY_IDS: CategoryId[] = [
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PTS",
]

export const defaultCategorySettings = (): CategorySetting[] =>
  ALL_CATEGORY_IDS.map((id) => ({ id, enabled: true, weight: 1 }))

export const effectiveWeights = (
  categories: CategorySetting[],
  puntCategoryIds: CategoryId[],
  focusCategoryIds: CategoryId[],
): Record<CategoryId, number> => {
  const punt = new Set(puntCategoryIds)
  const focus = new Set(focusCategoryIds)
  const out = {} as Record<CategoryId, number>
  for (const cat of categories) {
    if (!cat.enabled || punt.has(cat.id)) {
      out[cat.id] = 0
      continue
    }
    out[cat.id] = focus.has(cat.id) ? cat.weight * 1.5 : cat.weight
  }
  return out
}
