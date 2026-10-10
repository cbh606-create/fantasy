import { describe, expect, it } from "vitest"
import { loadStatPairs } from "@/lib/players/loadStatPairs"

describe("loadStatPairs", () => {
  it("returns pair rows from the last-season file without a current actual", async () => {
    const rows = await loadStatPairs([])
    expect(rows).toHaveLength(36)
  })

  it("does not throw when current players have projections and no seasonRates", async () => {
    const rows = await loadStatPairs([{
      projections: {
        FG_PCT: 0.5, FT_PCT: 0.8, TPM: 100, REB: 100, AST: 100,
        STL: 10, BLK: 10, TO: 10, PTS: 1000,
      },
    }])
    expect(Array.isArray(rows)).toBe(true)
  })
})
