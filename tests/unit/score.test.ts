import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"
import {
  categoryWinExpectancies,
  leagueMeanTotals,
  rosterTotals,
} from "@/lib/sim/score"

const projections = (
  overrides: Partial<Record<CategoryId, number>>,
): Record<CategoryId, number> => ({
  FG_PCT: 0,
  FT_PCT: 0,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
  ...overrides,
})

const player = (
  id: string,
  overrides: Partial<Record<CategoryId, number>>,
): Player => ({
  id,
  name: id,
  positions: ["PG"],
  projections: projections(overrides),
  adp: 1,
})

const weights = (
  overrides: Partial<Record<CategoryId, number>>,
): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, overrides[categoryId] ?? 0]),
  ) as Record<CategoryId, number>

describe("rosterTotals", () => {
  it("sums counting stats and averages rate stats", () => {
    const totals = rosterTotals([
      player("first", { FG_PCT: 0.4, FT_PCT: 0.7, REB: 5, TO: 3, PTS: 10 }),
      player("second", { FG_PCT: 0.6, FT_PCT: 0.9, REB: 7, TO: 2, PTS: 20 }),
    ])

    expect(totals.PTS).toBe(30)
    expect(totals.REB).toBe(12)
    expect(totals.TO).toBe(5)
    expect(totals.FG_PCT).toBeCloseTo(0.5)
    expect(totals.FT_PCT).toBeCloseTo(0.8)
  })

  it("returns zero totals for an empty roster", () => {
    expect(rosterTotals([])).toEqual(projections({}))
  })
})

describe("leagueMeanTotals", () => {
  it("averages each category across roster totals", () => {
    const means = leagueMeanTotals([
      [player("first", { FG_PCT: 0.4, REB: 4, PTS: 10 })],
      [player("second", { FG_PCT: 0.6, REB: 8, PTS: 30 })],
    ])

    expect(means.FG_PCT).toBeCloseTo(0.5)
    expect(means.REB).toBe(6)
    expect(means.PTS).toBe(20)
  })
})

describe("categoryWinExpectancies", () => {
  it("scores fewer turnovers higher when TO is weighted", () => {
    const means = leagueMeanTotals([
      [player("low-turnovers", { TO: 2 })],
      [player("high-turnovers", { TO: 6 })],
    ])
    const toWeights = weights({ TO: 1 })

    const lowTurnoverScore = categoryWinExpectancies(
      projections({ TO: 2 }),
      means,
      toWeights,
    )
    const highTurnoverScore = categoryWinExpectancies(
      projections({ TO: 6 }),
      means,
      toWeights,
    )

    expect(lowTurnoverScore).toBeGreaterThan(highTurnoverScore)
  })

  it("ignores turnover differences when TO is punted", () => {
    const means = leagueMeanTotals([
      [player("low-turnovers", { TO: 2 })],
      [player("high-turnovers", { TO: 6 })],
    ])
    const puntToWeights = weights({ TO: 0 })

    expect(
      categoryWinExpectancies(projections({ TO: 2 }), means, puntToWeights),
    ).toBe(
      categoryWinExpectancies(projections({ TO: 6 }), means, puntToWeights),
    )
  })

  it("uses population standard deviation from league roster totals", () => {
    const means = leagueMeanTotals([
      [player("zero-points", { PTS: 0 })],
      [player("four-points", { PTS: 4 })],
    ])

    const score = categoryWinExpectancies(
      projections({ PTS: 4 }),
      means,
      weights({ PTS: 1 }),
    )

    expect(score).toBeCloseTo(1 / (1 + Math.exp(-1)))
  })
})
