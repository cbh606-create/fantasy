import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import {
  assessSide,
  categoriesMovedGood,
  type CategoryTotalMap,
} from "@/lib/trade/accept"

const line = (overrides: Partial<CategoryTotalMap> = {}): CategoryTotalMap => ({
  FG_PCT: 0.45,
  FT_PCT: 0.75,
  TPM: 10,
  REB: 40,
  AST: 20,
  STL: 8,
  BLK: 4,
  TO: 12,
  PTS: 100,
  ...overrides,
})

const assess = (
  before: Partial<CategoryTotalMap>,
  after: Partial<CategoryTotalMap>,
  matchedWeak: CategoryId[],
) => assessSide({
  before: line(before),
  after: line(after),
  beforeMean: line(),
  afterMean: line(),
  weak: ["AST", "STL", "FG_PCT", "TO"],
  strong: ["REB"],
  matchedWeak,
})

describe("assessSide", () => {
  it("passes when one matched total improves and a strength stays above the mean", () => {
    const result = assess({ AST: 10, REB: 50 }, { AST: 14, REB: 45 }, ["AST", "STL"])

    expect(result.improved).toBe(true)
    expect(result.gains.map((gain) => gain.categoryId)).toEqual(["AST"])
    expect(result.strengthsIntact).toBe(true)
    expect(result.strengthsHeld).toEqual(["REB"])
  })

  it("rejects a strength that finishes on the bad side of the post-trade mean", () => {
    const result = assess({ AST: 10, REB: 50 }, { AST: 14, REB: 30 }, ["AST"])

    expect(result.strengthsIntact).toBe(false)
    expect(result.strengthsHeld).not.toContain("REB")
  })

  it("keeps a strength that lands exactly on the post-trade mean", () => {
    const result = assess({ AST: 10, REB: 50 }, { AST: 14, REB: 40 }, ["AST"])

    expect(result.strengthsIntact).toBe(true)
    expect(result.strengthsHeld).not.toContain("REB")
  })

  it("lists a weak category that gets worse without failing the side", () => {
    const result = assess(
      { AST: 10, STL: 4 },
      { AST: 14, STL: 2 },
      ["AST"],
    )

    expect(result.improved).toBe(true)
    expect(result.worsened).toEqual([
      { categoryId: "STL", before: 4, after: 2 },
    ])
  })

  it("treats a falling turnover total and a rising field-goal percentage as gains", () => {
    const turnovers = assess({ TO: 18 }, { TO: 11 }, ["TO"])
    const shooting = assess({ FG_PCT: 0.4 }, { FG_PCT: 0.48 }, ["FG_PCT"])

    expect(turnovers.gains).toEqual([{ categoryId: "TO", before: 18, after: 11 }])
    expect(shooting.gains[0]?.categoryId).toBe("FG_PCT")
    expect(assess({ TO: 18 }, { TO: 19 }, ["TO"]).improved).toBe(false)
    expect(assess({ FG_PCT: 0.4 }, { FG_PCT: 0.39 }, ["FG_PCT"]).improved).toBe(false)
  })
})

describe("categoriesMovedGood", () => {
  it("counts a risen total and a fallen turnover", () => {
    const before = {
      FG_PCT: 0.45,
      FT_PCT: 0.8,
      TPM: 2,
      REB: 8,
      AST: 4,
      STL: 1,
      BLK: 1,
      TO: 4,
      PTS: 18,
    }
    const after = { ...before, AST: 6, TO: 3, PTS: 16, TPM: 2 }

    expect(categoriesMovedGood(before, after).map((move) => move.categoryId))
      .toEqual(["AST", "TO"])
  })
})
