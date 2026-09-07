import { describe, expect, it } from "vitest"
import { emptyRates } from "@/lib/projections/rates"
import { compose } from "@/lib/projections/compose"

describe("compose", () => {
  it("scales usage cats and leaves stocks on minutes", () => {
    const rates = {
      ...emptyRates(),
      pts: 36,
      reb: 12,
      ast: 12,
      stl: 3,
      blk: 0,
      tov: 6,
      tpm: 6,
      shooting: { FGM: 12, FGA: 24, FTM: 6, FTA: 6 }
    }
    const out = compose({
      rates,
      mpg: 36,
      allocatedUsg: 30,
      baselineUsg: 20,
      pace: 100,
      positionMeanFg: 0.45,
      positionMeanFt: 0.75
    })
    expect(out.projections.PTS).toBeCloseTo(54, 5)
    expect(out.projections.REB).toBeCloseTo(12, 5)
    expect(out.projections.STL).toBeCloseTo(3, 5)
    expect(out.projections.FG_PCT).toBeCloseTo(0.5, 5)
    expect(out.shooting.FGA).toBeCloseTo(36, 5)
  })

  it("applies pace to counting stats", () => {
    const rates = { ...emptyRates(), pts: 36, reb: 12 }
    const out = compose({
      rates,
      mpg: 36,
      allocatedUsg: 20,
      baselineUsg: 20,
      pace: 110,
      positionMeanFg: 0.45,
      positionMeanFt: 0.75
    })
    expect(out.projections.PTS).toBeCloseTo(39.6, 5)
    expect(out.projections.REB).toBeCloseTo(13.2, 5)
  })
})
