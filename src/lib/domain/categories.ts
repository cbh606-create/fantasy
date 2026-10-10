export const ALL_CATEGORY_IDS = [
  "FG_PCT",
  "FT_PCT",
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "TO",
  "PTS"
] as const

export type CategoryId = (typeof ALL_CATEGORY_IDS)[number]
