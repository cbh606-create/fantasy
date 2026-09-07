import { describe, expect, it } from "vitest"
import { applyAging, AGING_ENABLED } from "@/lib/projections/aging"
import { emptyRates } from "@/lib/projections/rates"

describe("applyAging", () => {
  it("is off and identity", () => {
    expect(AGING_ENABLED).toBe(false)
    const rates = { ...emptyRates(), pts: 22 }
    expect(applyAging(rates, 35, "G")).toEqual(rates)
  })
})
