import { describe, expect, it } from "vitest"
import { rateFromBox } from "@/lib/projections/rates"
import type { SeasonBox } from "@/lib/projections/types"

const box = (over: Partial<SeasonBox> = {}): SeasonBox => ({
  playerId: "p1",
  name: "Test",
  season: 2025,
  teamId: "AAA",
  age: 26,
  positions: ["PG"],
  gp: 70,
  mp: 2520,
  mpg: 36,
  usg: 28,
  pts: 1764,
  reb: 280,
  ast: 420,
  stl: 70,
  blk: 21,
  tov: 210,
  tpm: 140,
  fgm: 630,
  fga: 1400,
  ftm: 350,
  fta: 400,
  ...over
})

describe("rateFromBox", () => {
  it("converts totals to per-36", () => {
    const r = rateFromBox(box())
    expect(r.pts).toBeCloseTo(25.2, 5)
    expect(r.shooting.FGA).toBeCloseTo(20, 5)
  })

  it("uses position-safe 1 minute when mp is 0", () => {
    const r = rateFromBox(box({ mp: 0, pts: 0 }))
    expect(r.pts).toBe(0)
  })
})
