import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import {
  blendWeekTotals,
  closeFinishedDays,
  dayComparisonRows,
  emptyCategoryTotals,
  projectDayTotals,
  startableIdsOnDate,
} from "@/lib/matchup/morningCheck"
import type { DayActuals } from "@/lib/matchup/morningCheck"
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

const zero = emptyCategoryTotals()

const actualLine = (
  date: string,
  youPts: number,
  oppPts: number,
): DayActuals => ({
  date,
  you: { ...zero, PTS: youPts },
  opp: { ...zero, PTS: oppPts },
  youPlayedIds: ["a"],
  oppPlayedIds: ["c"],
  youShooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
  oppShooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
})

describe("closeFinishedDays", () => {
  const playersById = new Map([
    ["a", player("a", "BOS", 1640)],
    ["added-later", player("added-later", "BOS", 2460)],
    ["c", player("c", "NYK", 1640)],
  ])
  const youEntries: SeasonRosterEntry[] = [
    { slot: "UTIL", playerId: "added-later" },
  ]
  const oppEntries: SeasonRosterEntry[] = [{ slot: "UTIL", playerId: "c" }]
  const days = ["2026-10-20", "2026-10-21"]

  it("freezes the first close and ignores a later roster add", () => {
    const first = closeFinishedDays({
      matchupDays: days,
      today: "2026-10-21",
      previousClosed: [
        {
          date: "2026-10-20",
          youStartableIds: ["a"],
          oppStartableIds: ["c"],
          youActual: { ...zero, PTS: 18 },
          oppActual: { ...zero, PTS: 12 },
          youPlayedIds: ["a"],
          oppPlayedIds: ["c"],
          youShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
          oppShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
        },
      ],
      actualsByDate: new Map([
        ["2026-10-20", actualLine("2026-10-20", 99, 99)],
      ]),
      schedule: schedule(),
      youEntries,
      oppEntries,
      playersById,
    })
    expect(first.closedDays[0]?.youStartableIds).toEqual(["a"])
    expect(first.closedDays[0]?.youActual.PTS).toBe(99)
    expect(first.actualsPending).toBe(false)

    const rows = dayComparisonRows(
      first.closedDays,
      playersById,
      schedule(),
      "season",
    )
    expect(rows[0]?.youProjection.PTS).toBeCloseTo(20)
    expect(rows[0]?.youActual.PTS).toBe(99)
  })

  it("leaves a played day open when ESPN has no final line", () => {
    const pending = closeFinishedDays({
      matchupDays: days,
      today: "2026-10-21",
      previousClosed: [],
      actualsByDate: new Map(),
      schedule: schedule(),
      youEntries,
      oppEntries,
      playersById,
    })
    expect(pending.closedDays).toEqual([])
    expect(pending.actualsPending).toBe(true)
  })

  it("closes a day with no NBA games at zero", () => {
    const quiet = closeFinishedDays({
      matchupDays: ["2026-10-19", "2026-10-20"],
      today: "2026-10-20",
      previousClosed: [],
      actualsByDate: new Map(),
      schedule: schedule(),
      youEntries,
      oppEntries,
      playersById,
    })
    expect(quiet.closedDays.map((day) => day.date)).toEqual(["2026-10-19"])
    expect(quiet.closedDays[0]?.youActual.PTS).toBe(0)
    expect(quiet.actualsPending).toBe(false)
  })

  it("adds closed actuals to remaining-day projections", () => {
    const closed = closeFinishedDays({
      matchupDays: days,
      today: "2026-10-21",
      previousClosed: [],
      actualsByDate: new Map([
        ["2026-10-20", actualLine("2026-10-20", 18, 12)],
      ]),
      schedule: schedule(),
      youEntries: [{ slot: "UTIL", playerId: "a" }],
      oppEntries,
      playersById,
    }).closedDays
    const blended = blendWeekTotals({
      closedDays: closed,
      remainingDates: ["2026-10-21"],
      youEntries: [{ slot: "UTIL", playerId: "a" }],
      oppEntries,
      playersById,
      schedule: schedule(),
      statWindow: "season",
    })
    expect(blended.you.PTS).toBeCloseTo(18)
    expect(blended.opp.PTS).toBeCloseTo(12)
    expect(blended.you.FG_PCT).toBeCloseTo(8 / 16)
  })
})
