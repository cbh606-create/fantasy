import { describe, expect, it } from "vitest"
import { readBreakoutStatLines } from "@/lib/injuries/breakoutStats"

describe("readBreakoutStatLines", () => {
  it("reads season, last-7, and projection lines without using actuals as the projection", () => {
    const lines = readBreakoutStatLines(
      [
        {
          id: "002026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 0,
          stats: { "42": 10, "40": 300, "0": 200 },
          averageStats: { "40": 30, "0": 20, "1": 1, "2": 1, "3": 5, "6": 4, "11": 2, "13": 8, "14": 16, "15": 4, "16": 5, "17": 2, "19": 0.5, "20": 0.8 },
        },
        {
          id: "012026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 1,
          stats: { "42": 7 },
          averageStats: { "40": 36, "0": 28, "1": 1, "2": 1, "3": 7, "6": 5, "11": 1, "13": 10, "14": 18, "15": 4, "16": 5, "17": 3, "19": 0.55, "20": 0.8 },
        },
        {
          id: "102026",
          seasonId: 2026,
          statSourceId: 1,
          statSplitTypeId: 0,
          stats: { "42": 70, "40": 1750, "0": 1400, "1": 70, "2": 70, "3": 350, "6": 280, "11": 140, "13": 560, "14": 1120, "15": 280, "16": 350, "17": 140 },
        },
      ],
      2026,
    )

    expect(lines.seasonGames).toBe(10)
    expect(lines.season?.minutesPerGame).toBe(30)
    expect(lines.season?.fgaPerGame).toBe(16)
    expect(lines.season?.rates?.PTS).toBe(20)
    expect(lines.last7?.gamesPlayed).toBe(7)
    expect(lines.last7?.minutesPerGame).toBe(36)
    expect(lines.projection?.minutesPerGame).toBe(25)
    expect(lines.projection?.rates?.PTS).toBe(20)
    expect(lines.projection?.rates?.FG_PCT).toBe(0.5)
  })

  it("returns null minutes when stat 40 is missing and still keeps category rates", () => {
    const lines = readBreakoutStatLines(
      [
        {
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 0,
          stats: { "42": 2 },
          averageStats: { "0": 10, "1": 0, "2": 0, "3": 1, "6": 2, "11": 1, "13": 4, "14": 10, "15": 2, "16": 2, "17": 1, "19": 0.4, "20": 1 },
        },
      ],
      2026,
    )

    expect(lines.seasonGames).toBe(2)
    expect(lines.season?.minutesPerGame).toBeNull()
    expect(lines.season?.rates?.PTS).toBe(10)
    expect(lines.projection).toBeNull()
    expect(lines.last7).toBeNull()
  })

  it("derives per-game minutes and counting rates from totals when averageStats is absent", () => {
    const lines = readBreakoutStatLines(
      [
        {
          id: "002026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 0,
          stats: {
            "0": 971,
            "1": 12,
            "2": 83,
            "3": 426,
            "6": 348,
            "11": 209,
            "13": 358,
            "14": 839,
            "15": 127,
            "16": 183,
            "17": 128,
            "19": 0.42669845,
            "20": 0.69398907,
            "40": 1853,
            "42": 64,
          },
        },
        {
          id: "012026",
          seasonId: 2026,
          statSourceId: 0,
          statSplitTypeId: 1,
          stats: {
            "0": 11,
            "1": 2,
            "2": 1,
            "3": 8,
            "6": 3,
            "11": 4,
            "13": 4,
            "14": 10,
            "15": 1,
            "16": 4,
            "17": 2,
            "19": 0.4,
            "20": 0.25,
            "40": 27,
            "42": 1,
          },
        },
        {
          id: "102026",
          seasonId: 2026,
          statSourceId: 1,
          statSplitTypeId: 0,
          stats: {
            "0": 807,
            "1": 27,
            "2": 80,
            "3": 369,
            "6": 308,
            "11": 188,
            "13": 306,
            "14": 683,
            "15": 125,
            "16": 188,
            "17": 70,
            "19": 0.448,
            "20": 0.664,
            "40": 1668.3,
            "42": 67,
          },
        },
      ],
      2026,
    )

    expect(lines.seasonGames).toBe(64)
    expect(lines.season?.minutesPerGame).toBeCloseTo(1853 / 64)
    expect(lines.season?.fgaPerGame).toBeCloseTo(839 / 64)
    expect(lines.season?.rates?.PTS).toBeCloseTo(971 / 64)
    expect(lines.last7?.minutesPerGame).toBe(27)
    expect(lines.projection?.minutesPerGame).toBeCloseTo(1668.3 / 67)
    expect(lines.projection?.minutesPerGame).not.toBeCloseTo(1853 / 64)
    expect(lines.projection?.rates?.PTS).toBeCloseTo(807 / 67)
  })
})
