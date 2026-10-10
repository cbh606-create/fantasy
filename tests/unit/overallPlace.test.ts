import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { overallPlaces } from "@/lib/trade/overallPlace"

const ranksFor = (rank: number): Record<CategoryId, number> =>
  Object.fromEntries(ALL_CATEGORY_IDS.map((categoryId) => [categoryId, rank])) as Record<CategoryId, number>

describe("overallPlaces", () => {
  it("places the smaller rank sum first and breaks ties by team index", () => {
    const places = overallPlaces([
      { teamIndex: 2, ranks: ranksFor(2) },
      { teamIndex: 0, ranks: ranksFor(1) },
      { teamIndex: 1, ranks: ranksFor(2) },
    ])

    expect(places).toEqual([
      { teamIndex: 0, rank: 1, rankSum: 9 },
      { teamIndex: 1, rank: 2, rankSum: 18 },
      { teamIndex: 2, rank: 3, rankSum: 18 },
    ])
  })
})
