import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/categories"
import { loadFixtureSeason } from "@/lib/projections/adapter"
import { backtest, categoryZ, spearman } from "@/lib/projections/backtest"
import { lastYearBaseline } from "@/lib/projections/baseline"
import { projectSeason } from "@/lib/projections/pipeline"

const cats = (overrides: Partial<Record<CategoryId, number>> = {}): Record<CategoryId, number> => {
  const base = Object.fromEntries(ALL_CATEGORY_IDS.map((id) => [id, 1])) as Record<CategoryId, number>
  return { ...base, ...overrides }
}

describe("spearman", () => {
  it("is 1 for identical ranks and -1 for reversed ranks", () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBe(1)
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1)
  })
})

describe("categoryZ", () => {
  it("inverts TO so higher turnovers score worse", () => {
    const pool = [cats({ TO: 1, PTS: 10 }), cats({ TO: 2, PTS: 20 }), cats({ TO: 3, PTS: 30 })]
    const z = categoryZ(cats({ TO: 3, PTS: 30 }), pool)
    expect(z.TO).toBeLessThan(0)
    expect(z.PTS).toBeGreaterThan(0)
  })
})

describe("backtest holdout", () => {
  it("beats last-year baseline on constructed vacancy fixtures", async () => {
    const t = await loadFixtureSeason("data/fixtures/projection-season-t.json")
    const t1 = await loadFixtureSeason("data/fixtures/projection-season-t1.json")
    const predicted = projectSeason(t.boxes, t1.rosters, t1.rookies)
    const baseline = lastYearBaseline(t.boxes, 2026)
    const actuals = (t1.actuals ?? []).filter((row) => row.teamId === "AAA" && row.gp >= 20)
    const report = backtest({
      predicted,
      baseline,
      actuals
    })
    expect(report.beatsMae).toBe(true)
    expect(report.beatsSpearman).toBe(true)
  })
})
