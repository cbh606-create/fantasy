import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { chaseCategoryIds } from "@/lib/matchup/streamingDropExplain"
import {
  adjustedChaseWinProb,
  mergeStreamingPuntIds,
  priorityChaseCategoryId,
  shiftMatchupBoardByOpponentDelta,
  streamingChaseNote,
} from "@/lib/matchup/chasePair"
import type { MatchupBoard } from "@/lib/matchup/types"
import type { StatPairRow } from "@/lib/players/statPairCorrelation"

const board = (rows: Partial<Record<CategoryId, { outcome: "W" | "L" | "T"; winProb: number }>>): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => {
    const row = rows[categoryId]
    return {
      categoryId,
      you: 1,
      opp: 1,
      outcome: row?.outcome ?? "W",
      winProb: row?.winProb ?? 0.8,
    }
  }),
  wins: 7,
  losses: 2,
  ties: 0,
  projectedCatWins: 6,
})

const pair = (
  categoryA: CategoryId,
  categoryB: CategoryId,
  r: number,
  measured = true,
): StatPairRow => ({
  categoryA,
  categoryB,
  r,
  penalty: !measured || r >= 0 ? 0 : -r * 0.15,
  n: 40,
  measured,
})

describe("mergeStreamingPuntIds", () => {
  it("keeps weight-zero punts and adds the matchup toggles", () => {
    const ids = mergeStreamingPuntIds(
      [
        { id: "TO", weight: 0 },
        { id: "PTS", weight: 1 },
      ],
      ["AST"],
    )
    expect([...ids].sort()).toEqual(["AST", "TO"])
  })

  it("adds nothing when the toggle is off", () => {
    const ids = mergeStreamingPuntIds([{ id: "TO", weight: 0 }])
    expect([...ids]).toEqual(["TO"])
  })
})

describe("streamingChaseNote", () => {
  const pairs = [
    pair("AST", "TO", -0.5),
    pair("AST", "STL", 0.2),
  ]

  it("shows penalty 0 when only one chase remains", () => {
    expect(streamingChaseNote(["AST"], pairs)).toEqual({
      categoryIds: ["AST"],
      r: null,
      penalty: 0,
    })
  })

  it("uses the remaining pair after TO leaves the chase", () => {
    expect(streamingChaseNote(["STL", "AST"], pairs)).toMatchObject({
      categoryIds: ["AST", "STL"],
      r: 0.2,
      penalty: 0,
    })
  })

  it("charges the measured negative pair", () => {
    expect(streamingChaseNote(["AST", "TO"], pairs).penalty).toBeCloseTo(0.075)
  })

  it("charges nothing when the pair is unmeasured", () => {
    expect(streamingChaseNote(["REB", "BLK"], [pair("BLK", "REB", -0.4, false)]).penalty).toBe(0)
  })
})

describe("priorityChaseCategoryId", () => {
  it("prefers a contestable undeclared leak over the larger gap", () => {
    const matchup = board({
      REB: { outcome: "L", winProb: 0.45 },
      AST: { outcome: "L", winProb: 0.3 },
    })
    expect(priorityChaseCategoryId(matchup, ["REB", "AST"], new Set(["REB"]))).toBe("REB")
  })

  it("uses the larger gap when no contestable leak is in the chase", () => {
    const matchup = board({
      REB: { outcome: "L", winProb: 0.45 },
      AST: { outcome: "L", winProb: 0.3 },
    })
    expect(priorityChaseCategoryId(matchup, ["REB", "AST"], new Set(["PTS"]))).toBe("AST")
  })
})

describe("adjustedChaseWinProb", () => {
  it("subtracts the penalty only when the add raises both chases", () => {
    expect(adjustedChaseWinProb(0.2, true, 0.075)).toBeCloseTo(0.125)
    expect(adjustedChaseWinProb(0.12, false, 0.075)).toBeCloseTo(0.12)
  })

  it("lets the dual raiser pass only when the gain clears the penalty", () => {
    const specialist = adjustedChaseWinProb(0.1, false, 0.075)
    const short = adjustedChaseWinProb(0.16, true, 0.075)
    const clear = adjustedChaseWinProb(0.18, true, 0.075)
    expect(short).toBeLessThan(specialist)
    expect(clear).toBeGreaterThan(specialist)
  })
})

describe("shiftMatchupBoardByOpponentDelta", () => {
  const totals = (overrides: Partial<Record<CategoryId, number>> = {}) =>
    Object.fromEntries(
      ALL_CATEGORY_IDS.map((categoryId) => [categoryId, overrides[categoryId] ?? 0]),
    ) as Record<CategoryId, number>

  it("keeps the chase when the opponent stream adds nothing", () => {
    const matchup = board({
      FG_PCT: { outcome: "L", winProb: 0.4 },
      AST: { outcome: "L", winProb: 0.45 },
    })
    const same = totals()
    const shifted = shiftMatchupBoardByOpponentDelta(matchup, same, same)
    expect(chaseCategoryIds(shifted)).toEqual(chaseCategoryIds(matchup))
    expect(shifted.categories.map((row) => row.winProb)).toEqual(
      matchup.categories.map((row) => row.winProb),
    )
  })

  it("drops a chase category once the opponent stream blows it out", () => {
    const matchup = board({
      FG_PCT: { outcome: "L", winProb: 0.4 },
      AST: { outcome: "L", winProb: 0.45 },
    })
    const shifted = shiftMatchupBoardByOpponentDelta(
      matchup,
      totals(),
      totals({ AST: 40 }),
    )
    expect(chaseCategoryIds(matchup)).toEqual(["AST", "FG_PCT"])
    expect(chaseCategoryIds(shifted)).toEqual(["FG_PCT"])
    const ast = shifted.categories.find((row) => row.categoryId === "AST")
    expect(ast?.winProb).toBeLessThan(0.28)
  })
})
