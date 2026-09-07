import { describe, expect, it } from "vitest"
import { loadFixtureSeason } from "@/lib/projections/adapter"
import { projectSeason } from "@/lib/projections/pipeline"
import { weightedUsage } from "@/lib/projections/usage"

describe("fixture pipeline", () => {
  it("keeps team minutes at 240 and caps mpg", async () => {
    const t = await loadFixtureSeason("data/fixtures/projection-season-t.json")
    const t1 = await loadFixtureSeason("data/fixtures/projection-season-t1.json")
    const out = projectSeason(t.boxes, t1.rosters, t1.rookies)
    const byTeam = new Map<string, typeof out>()
    for (const row of out) {
      const rows = byTeam.get(row.teamId) ?? []
      rows.push(row)
      byTeam.set(row.teamId, rows)
    }
    for (const rows of byTeam.values()) {
      expect(Math.max(...rows.map((p) => p.mpg))).toBeLessThanOrEqual(38)
    }
    const aaa = byTeam.get("AAA") ?? []
    const mpgSum = aaa.reduce((s, p) => s + p.mpg, 0)
    expect(mpgSum).toBeCloseTo(240, 3)
    const aaaUsg = new Map(aaa.map((p) => [p.playerId, p.usg]))
    const aaaMpg = new Map(aaa.map((p) => [p.playerId, p.mpg]))
    expect(weightedUsage(aaaUsg, aaaMpg)).toBeCloseTo(100, 3)
    const backup = aaa.find((p) => p.playerId === "backup")
    const pick1 = aaa.find((p) => p.playerId === "pick1")
    expect(backup?.mpg).toBeGreaterThan(16)
    expect(pick1?.source).toBe("rookie_prior")
    expect(pick1?.mpg).toBeGreaterThan(10)
    const bbb = byTeam.get("BBB") ?? []
    expect(bbb).toHaveLength(6)
    expect(bbb.reduce((s, p) => s + p.mpg, 0)).toBeLessThan(240)
  })
})
