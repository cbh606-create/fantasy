import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import type { TeamCategoryTotals } from "@/lib/season/analysis"
import {
  classifyTeam,
  matchedWeaks,
  teamsMatch,
} from "@/lib/trade/classify"

const totals = (
  teamIndex: number,
  overrides: Partial<Record<CategoryId, number>>,
): TeamCategoryTotals => ({
  teamIndex,
  totals: {
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
  },
})

describe("classifyTeam", () => {
  const league = [
    totals(0, { AST: 10, REB: 50, TO: 20, PTS: 100 }),
    totals(1, { AST: 30, REB: 10, TO: 4, PTS: 100 }),
  ]

  it("marks the bad side weak and the good side strong, including turnovers", () => {
    const you = classifyTeam(league, 0)

    expect(you.weak).toContain("AST")
    expect(you.weak).toContain("TO")
    expect(you.strong).toContain("REB")
    expect(you.weak).not.toContain("PTS")
    expect(you.strong).not.toContain("PTS")
  })

  it("matches teams that swap different categories", () => {
    const you = classifyTeam(league, 0)
    const them = classifyTeam(league, 1)

    expect(teamsMatch(you, them)).toBe(true)
    expect(matchedWeaks(you, them)).toEqual(expect.arrayContaining(["AST", "TO"]))
    expect(matchedWeaks(them, you)).toContain("REB")
    expect(matchedWeaks(you, them).some((categoryId) =>
      matchedWeaks(them, you).includes(categoryId),
    )).toBe(false)
  })

  it("does not match a team with no strong category", () => {
    const flat = [totals(0), totals(1)]

    expect(teamsMatch(classifyTeam(flat, 0), classifyTeam(flat, 1))).toBe(false)
  })
})
