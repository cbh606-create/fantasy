import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { StatBasis } from "@/lib/season/analysis"
import { TRADE_SHAPES } from "@/lib/trade/fairFill"
import type { TradeShape } from "@/lib/trade/types"

export type SuggestionQuery =
  | { mode: "preview" }
  | { mode: "invalid" }
  | {
      mode: "generate"
      targetCategoryIds: CategoryId[]
      excludedPlayerIds: string[]
      shapes?: TradeShape[]
      basis?: StatBasis
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

  const requestedShapes = url.searchParams.getAll("shape")
  if (requestedShapes.some((shape) => !TRADE_SHAPES.includes(shape as TradeShape))) {
    return { mode: "invalid" }
  }

  const shapes = TRADE_SHAPES.filter((shape) => requestedShapes.includes(shape))
  const basis = url.searchParams.get("basis")
  if (basis && basis !== "total" && basis !== "perGame") {
    return { mode: "invalid" }
  }

  return {
    mode: "generate",
    targetCategoryIds: [...new Set(categories)] as CategoryId[],
    excludedPlayerIds: splitList(url.searchParams.get("excludedPlayerIds")),
    ...(shapes.length ? { shapes } : {}),
    ...(basis === "perGame" ? { basis: "perGame" as const } : {}),
  }
}
