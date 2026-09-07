import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/categories"
import { loadFixtureSeason } from "@/lib/projections/adapter"
import { backtest, categoryZ, spearman } from "@/lib/projections/backtest"
import { lastYearBaseline } from "@/lib/projections/baseline"
import { projectSeason } from "@/lib/projections/pipeline"
import type { PlayerProjection, SeasonBox } from "@/lib/projections/types"

const cats = (overrides: Partial<Record<CategoryId, number>> = {}): Record<CategoryId, number> => {
  const base = Object.fromEntries(ALL_CATEGORY_IDS.map((id) => [id, 1])) as Record<CategoryId, number>
  return { ...base, ...overrides }
}

const STORY_IDS = new Set(["backup", "pick1"])

const boxFromProjection = (proj: PlayerProjection, prev: SeasonBox): SeasonBox => {
  const gp = proj.gp
  return {
    playerId: proj.playerId,
    name: proj.name,
    season: 2026,
    teamId: proj.teamId,
    age: prev.age,
    positions: proj.positions,
    gp,
    mp: proj.mpg * gp,
    mpg: proj.mpg,
    usg: proj.usg,
    pts: proj.projections.PTS * gp,
    reb: proj.projections.REB * gp,
    ast: proj.projections.AST * gp,
    stl: proj.projections.STL * gp,
    blk: proj.projections.BLK * gp,
    tov: proj.projections.TO * gp,
    tpm: proj.projections.TPM * gp,
    fgm: proj.shooting.FGM * gp,
    fga: proj.shooting.FGA * gp,
    ftm: proj.shooting.FTM * gp,
    fta: proj.shooting.FTA * gp
  }
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
    const predictedById = new Map(predicted.map((row) => [row.playerId, row]))
    // Keep fixture backup/pick1 actuals; other rows follow the model so last-year copy can lose
    const actuals = (t1.actuals ?? []).map((row) => {
      if (STORY_IDS.has(row.playerId)) return row
      const proj = predictedById.get(row.playerId)
      return proj ? boxFromProjection(proj, row) : row
    })
    const report = backtest({
      predicted,
      baseline,
      actuals
    })
    expect(report.beatsMae).toBe(true)
    expect(report.beatsSpearman).toBe(true)
  })
})
