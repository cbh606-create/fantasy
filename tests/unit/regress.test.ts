import { describe, expect, it } from "vitest"
import { emptyRates } from "@/lib/projections/rates"
import { regressRates, regressUsg } from "@/lib/projections/regress"

describe("regressRates", () => {
  it("returns the mean when gp is 0", () => {
    const mean = { ...emptyRates(), pts: 18 }
    const observed = { ...emptyRates(), pts: 40 }
    expect(regressRates(observed, mean, 0).pts).toBe(18)
  })

  it("pulls noisy counting stats toward the mean", () => {
    const mean = { ...emptyRates(), pts: 18 }
    const observed = { ...emptyRates(), pts: 40 }
    const out = regressRates(observed, mean, 20)
    expect(out.pts).toBeGreaterThan(18)
    expect(out.pts).toBeLessThan(40)
  })
})

describe("regressUsg", () => {
  it("uses k=40", () => {
    expect(regressUsg(30, 20, 40)).toBe(25)
  })
})
