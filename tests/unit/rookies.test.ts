import { describe, expect, it } from "vitest"
import { rookiePlayingTime, rookieRates } from "@/lib/projections/rookies"
import { emptyRates } from "@/lib/projections/rates"

describe("rookiePlayingTime", () => {
  it("gives 1-4 more minutes than undrafted", () => {
    expect(rookiePlayingTime(1).mpg).toBeGreaterThan(rookiePlayingTime(null).mpg)
    expect(rookiePlayingTime(1).usg).toBe(24)
  })
})

describe("rookieRates", () => {
  it("uses position mean when no translation", () => {
    const mean = { ...emptyRates(), pts: 16 }
    const out = rookieRates(
      { playerId: "r", name: "R", positions: ["PG"], age: 19, draftSlot: 1 },
      mean
    )
    expect(out.pts).toBe(16)
  })

  it("mixes translated rates 50/50", () => {
    const mean = { ...emptyRates(), pts: 10 }
    const translated = { ...emptyRates(), pts: 20 }
    const out = rookieRates(
      {
        playerId: "r",
        name: "R",
        positions: ["PG"],
        age: 19,
        draftSlot: 1,
        rates: translated
      },
      mean
    )
    expect(out.pts).toBe(15)
  })
})
