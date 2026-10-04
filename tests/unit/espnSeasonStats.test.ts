import { describe, expect, it } from "vitest"
import {
  pickBestStats,
  pickProjectedStats,
  pickActualStats,
  shootingFromStats,
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

  it("prefers current-season 102027 projections over prior-season 102026", () => {
    const bothSeasons = {
      stats: [
        ...player.stats,
        {
          id: "102027",
          seasonId: 2027,
          statSourceId: 1,
          statSplitTypeId: 0,
          stats: { "0": 1800, "6": 800, "3": 300, "17": 190, "42": 72 },
        },
      ],
    }

    const pick = pickBestStats(bothSeasons, 2027)
    expect(pick?.kind).toBe("projection")
    expect(pick?.id).toBe("102027")
    expect(pick?.seasonId).toBe(2027)
    expect(pick?.stats["0"]).toBe(1800)
  })

  it("falls back to prior-season projections when current season has none", () => {
    const pick = pickBestStats(player, 2027)
    expect(pick?.kind).toBe("projection")
    expect(pick?.id).toBe("102026")
    expect(pick?.seasonId).toBe(2026)
  })

  it("reads season shooting totals from ESPN stat keys", () => {
    expect(
      shootingFromStats({
        "13": 600,
        "14": 1200,
        "15": 300,
        "16": 400,
      }),
    ).toEqual({
      FGM: 600,
      FGA: 1200,
      FTM: 300,
      FTA: 400,
    })
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
