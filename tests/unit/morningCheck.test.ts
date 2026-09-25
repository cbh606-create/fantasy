import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import { projectDayTotals, startableIdsOnDate } from "@/lib/matchup/morningCheck"
import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import type { ScheduleResponse } from "@/lib/season/types"

const totals = (overrides: Partial<Record<CategoryId, number>> = {}) =>
  ({
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 2,
    REB: 5,
    AST: 3,
    STL: 1,
    BLK: 1,
    TO: 2,
    PTS: 20,
    ...overrides,
  }) as Record<CategoryId, number>

const player = (
  id: string,
  teamAbbr: string,
  points: number,
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  projections: totals({ PTS: points }),
  projectedGames: 82,
  shooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
})

const schedule = (): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 20261020,
    startDate: "2026-10-20",
    endDate: "2026-10-26",
    days: ["2026-10-20", "2026-10-21"],
  },
  games: [
    { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "NYK" },
  ],
})

describe("projectDayTotals", () => {
  it("projects only the saved ids who play that date", () => {
    const players = [
      player("a", "BOS", 1640),
      player("b", "LAL", 820),
    ]
    const playersById = new Map(players.map((item) => [item.id, item]))
    const entries: SeasonRosterEntry[] = [
      { slot: "UTIL", playerId: "a" },
      { slot: "BE", playerId: "b" },
      { slot: "UTIL", playerId: null },
    ]

    expect(
      startableIdsOnDate(entries, playersById, "2026-10-20", schedule()),
    ).toEqual(["a"])

    const projected = projectDayTotals(
      ["a", "b"],
      playersById,
      "2026-10-20",
      schedule(),
      "season",
    )
    expect(projected.PTS).toBeCloseTo(20)
    expect(projected.FG_PCT).toBeCloseTo(0.5)
  })

  it("uses the selected window rates for the same ids", () => {
    const withWindow = player("a", "BOS", 1640)
    withWindow.recentRates = {
      l7: {
        projections: totals({ PTS: 10 }),
        shooting: { FGM: 4, FGA: 10, FTM: 2, FTA: 2 },
      },
    }
    const playersById = new Map([["a", withWindow]])
    const seasonPts = projectDayTotals(
      ["a"],
      playersById,
      "2026-10-20",
      schedule(),
      "season",
    ).PTS
    const recentPts = projectDayTotals(
      ["a"],
      playersById,
      "2026-10-20",
      schedule(),
      "l7",
    ).PTS
    expect(seasonPts).toBeCloseTo(20)
    expect(recentPts).toBeCloseTo(10)
  })
})
