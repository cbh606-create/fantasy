import { describe, expect, it } from "vitest"
import { buildMatchupBoard, categoryWinProb } from "@/lib/matchup/board"
import type { CategoryId } from "@/lib/domain/types"

const baseTotals = (): Record<CategoryId, number> => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 10,
  REB: 50,
  AST: 50,
  STL: 10,
  BLK: 5,
  TO: 20,
  PTS: 100,
})

describe("categoryWinProb", () => {
  it("uses inverted delta for TO", () => {
    expect(categoryWinProb(15, 20, "TO")).toBeGreaterThan(0.5)
    expect(categoryWinProb(25, 20, "TO")).toBeLessThan(0.5)
  })

  it("keeps small PTS edges uncertain and FG% edges meaningful", () => {
    const pts = categoryWinProb(100.5, 100, "PTS")
    expect(pts).toBeGreaterThan(0.45)
    expect(pts).toBeLessThan(0.6)

    const fg = categoryWinProb(0.46, 0.45, "FG_PCT")
    expect(fg).toBeGreaterThan(0.55)
    expect(fg).toBeLessThan(0.75)
  })
})

describe("buildMatchupBoard", () => {
  it("marks PTS W when you higher; TO W when you lower", () => {
    const youHigherPtsLowerTo = { ...baseTotals(), PTS: 120, TO: 15 }
    const opp = baseTotals()
    const board = buildMatchupBoard(youHigherPtsLowerTo, opp)
    expect(board.categories.find((c) => c.categoryId === "PTS")?.outcome).toBe("W")
    expect(board.categories.find((c) => c.categoryId === "TO")?.outcome).toBe("W")
  })

  it("ties equal values", () => {
    const same = baseTotals()
    expect(buildMatchupBoard(same, same).ties).toBe(9)
  })

  it("winProb rises when you increase PTS", () => {
    const base = baseTotals()
    const opp = { ...baseTotals(), PTS: 100 }
    const low = buildMatchupBoard(base, opp)
    const high = buildMatchupBoard({ ...base, PTS: base.PTS + 20 }, opp)
    const pLow = low.categories.find((c) => c.categoryId === "PTS")!.winProb
    const pHigh = high.categories.find((c) => c.categoryId === "PTS")!.winProb
    expect(pHigh).toBeGreaterThan(pLow)
  })
})
