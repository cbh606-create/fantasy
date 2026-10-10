import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export type SuggestionQuery =
  | { mode: "preview" }
  | { mode: "invalid" }
  | {
      mode: "generate"
      targetCategoryIds: CategoryId[]
      excludedPlayerIds: string[]
    }

const splitList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)

export const parseSuggestionQuery = (url: URL): SuggestionQuery => {
  const categories = splitList(url.searchParams.get("categories"))

  if (!categories.length) {
    return { mode: "preview" }
  }

  if (categories.some((categoryId) =>
    !ALL_CATEGORY_IDS.includes(categoryId as CategoryId))) {
    return { mode: "invalid" }
  }

  return {
    mode: "generate",
    targetCategoryIds: [...new Set(categories)] as CategoryId[],
    excludedPlayerIds: splitList(url.searchParams.get("excludedPlayerIds")),
  }
}
