import { describe, expect, it } from "vitest"
import { gamesPrior } from "@/lib/projections/games"

describe("gamesPrior", () => {
  it("returns the mean when last gp is 0", () => {
    expect(gamesPrior(0, 64)).toBe(64)
  })

  it("clamps to 1..82", () => {
    expect(gamesPrior(82, 82)).toBe(82)
    expect(gamesPrior(0, 0)).toBe(1)
  })
})
