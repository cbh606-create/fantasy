import { describe, expect, it } from "vitest"
import { loadFixtureSeason } from "@/lib/projections/adapter"
import { projectSeason } from "@/lib/projections/pipeline"

describe("fixture pipeline", () => {
  it("keeps team minutes at 240 and caps mpg", async () => {
    const t = await loadFixtureSeason("data/fixtures/projection-season-t.json")
    const t1 = await loadFixtureSeason("data/fixtures/projection-season-t1.json")
    const out = projectSeason(t.boxes, t1.rosters, t1.rookies)
    const aaa = out.filter((p) => p.teamId === "AAA")
    const mpgSum = aaa.reduce((s, p) => s + p.mpg, 0)
    expect(mpgSum).toBeCloseTo(240, 3)
    expect(Math.max(...aaa.map((p) => p.mpg))).toBeLessThanOrEqual(38)
    const backup = aaa.find((p) => p.playerId === "backup")
    const pick1 = aaa.find((p) => p.playerId === "pick1")
    expect(backup?.mpg).toBeGreaterThan(16)
    expect(pick1?.source).toBe("rookie_prior")
    expect(pick1?.mpg).toBeGreaterThan(10)
  })
})
