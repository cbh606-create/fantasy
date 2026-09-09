import { describe, expect, it } from "vitest"
import {
  pickBestStats,
  pickProjectedStats,
  pickActualStats,
} from "../../scripts/lib/espn-season-stats.mjs"

const player = {
  stats: [
    {
      id: "002026",
      seasonId: 2026,
      statSourceId: 0,
      statSplitTypeId: 0,
      stats: { "0": 1799, "6": 836, "3": 697, "17": 112, "42": 65 },
    },
    {
      id: "102026",
      seasonId: 2026,
      statSourceId: 1,
      statSplitTypeId: 0,
      stats: { "0": 2144, "6": 940, "3": 747, "17": 130, "42": 74 },
    },
  ],
}

describe("espn-season-stats", () => {
  it("prefers projections over actuals for the same season", () => {
    const pick = pickBestStats(player, 2026)
    expect(pick?.kind).toBe("projection")
    expect(pick?.id).toBe("102026")
    expect(pick?.stats["0"]).toBe(2144)
  })

  it("falls back to prior-season projections when current season has none", () => {
    const pick = pickBestStats(player, 2027)
    expect(pick?.kind).toBe("projection")
    expect(pick?.id).toBe("102026")
    expect(pick?.seasonId).toBe(2026)
  })

  it("uses actuals only when no projection row exists", () => {
    const actualOnly = {
      stats: [
        {
          id: "002026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 0,
          stats: { "0": 1799, "6": 836, "3": 697, "17": 112, "42": 65 },
        },
      ],
    }
    expect(pickProjectedStats(actualOnly, 2026)).toBeNull()
    expect(pickActualStats(actualOnly, 2026)?.id).toBe("002026")
    expect(pickBestStats(actualOnly, 2027)?.kind).toBe("actual")
  })
})
