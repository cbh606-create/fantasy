import type { CategoryId } from "@/lib/domain/types";
import type { MatchupBoard } from "./types";
import { CONTESTED_WIN_PROB_MIN } from "./streamingDropExplain";

export const mostCategoriesHeadline = (wins: number, losses: number): string => {
  if (wins > losses) return "1–0";
  if (losses > wins) return "0–1";
  return "0–0–1";
};

export const mostCategoriesSeedPuntIds = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.winProb < CONTESTED_WIN_PROB_MIN)
    .map((row) => row.categoryId);
