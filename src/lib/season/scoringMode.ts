import type { SeasonScoringMode } from "@/lib/season/types"

export const scoringModeFromEspn = (
  scoringType: string | undefined,
): SeasonScoringMode | undefined => {
  if (scoringType === "H2H_CATEGORY") return "each_category"
  if (scoringType === "H2H_MOST_CATEGORIES") return "most_categories"
  return undefined
}

export const seasonScoringModeLabel = (
  mode: SeasonScoringMode | undefined,
): string | null => {
  if (mode === "each_category") return "Each Category"
  if (mode === "most_categories") return "Most Categories"
  return null
}
