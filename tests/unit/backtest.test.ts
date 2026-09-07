import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/categories"
import { loadFixtureSeason } from "@/lib/projections/adapter"
import { backtest, categoryZ, spearman } from "@/lib/projections/backtest"
import { findBox, lastYearBaseline } from "@/lib/projections/baseline"
import { projectSeason } from "@/lib/projections/pipeline"
import type { SeasonBox } from "@/lib/projections/types"

const seasonBox = (overrides: Partial<SeasonBox> & Pick<SeasonBox, "playerId" | "teamId">): SeasonBox => ({
  name: overrides.playerId,
  season: 2025,
  age: 26,
  positions: ["PG"],
  gp: 70,
  mp: 2100,
  mpg: 30,
  usg: 20,
  pts: 1400,
  reb: 400,
  ast: 350,
  stl: 80,
  blk: 50,
  tov: 180,
  tpm: 140,
  fgm: 520,
  fga: 1100,
  ftm: 240,
  fta: 300,
  ...overrides
})

const cats = (overrides: Partial<Record<CategoryId, number>> = {}): Record<CategoryId, number> => {
  const base = Object.fromEntries(ALL_CATEGORY_IDS.map((id) => [id, 1])) as Record<CategoryId, number>
  return { ...base, ...overrides }
}

describe("spearman", () => {
  it("is 1 for identical ranks and -1 for reversed ranks", () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1)
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1)
  })

  it("is 0 when ranks have zero variance", () => {
    expect(spearman([3, 3, 3, 3], [3, 3, 3, 3])).toBe(0)
    expect(spearman([1, 1, 1], [4, 5, 6])).toBe(0)
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

describe("TOT lookup", () => {
  it("prefers TOT over split-team rows", () => {
    const boxes = [
      seasonBox({ playerId: "split", teamId: "AAA", mpg: 10, usg: 10 }),
      seasonBox({ playerId: "split", teamId: "BBB", mpg: 12, usg: 12 }),
      seasonBox({ playerId: "split", teamId: "TOT", mpg: 22, usg: 20 })
    ]
    expect(findBox(boxes, "split")?.teamId).toBe("TOT")
    const baseline = lastYearBaseline(boxes, 2026)
    const rows = baseline.filter((row) => row.playerId === "split")
    expect(rows).toHaveLength(1)
    expect(rows[0].mpg).toBe(22)
    expect(rows[0].usg).toBe(20)
  })

  it("uses TOT actuals in backtest when split rows come first", () => {
    const tot = seasonBox({ playerId: "split", teamId: "TOT", mpg: 30 })
    const split = seasonBox({ playerId: "split", teamId: "AAA", mpg: 10 })
    const predicted = lastYearBaseline([tot], 2026)
    const baseline = lastYearBaseline([tot], 2026)
    const report = backtest({
      predicted,
      baseline,
      actuals: [split, tot]
    })
    expect(report.eligibleIds).toEqual(["split"])
    expect(report.mae.MPG.model).toBe(0)
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
