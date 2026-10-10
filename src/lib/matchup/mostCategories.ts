import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "./types"

/** Most Categories auto-punts cats below this winProb. */
export const MOST_CATEGORIES_PUNT_SEED_MAX = 0.4

export const mostCategoriesSeedPuntIds = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.winProb < MOST_CATEGORIES_PUNT_SEED_MAX)
    .map((row) => row.categoryId)
