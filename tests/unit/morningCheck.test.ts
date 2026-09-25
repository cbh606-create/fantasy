import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { buildMatchupBoard } from "@/lib/matchup/board"
import {
  blendWeekTotals,
  buildMorningSummary,
  closeFinishedDays,
  outcomesFromBoard,
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

const boardFromPts = (youPts: number, oppPts: number) => {
  const you = emptyCategoryTotals()
  const opp = emptyCategoryTotals()
  you.PTS = youPts
  opp.PTS = oppPts
  return buildMatchupBoard(you, opp)
}

const identicalAddDay = {
  date: "2026-10-21",
  cells: [
    {
      spotIndex: 0,
      playerId: "fa-on",
      action: "add" as const,
      droppedPlayerId: null,
      rosterDropPlayerId: null,
      rosterDropKind: "none" as const,
      addIndex: 1,
      alternativePlayerIds: [],
      targetCategoryIds: ["PTS"] as CategoryId[],
    },
  ],
}

describe("buildMorningSummary", () => {
  it("lists all nine categories and marks only the flip", () => {
    const previousOutcomes = outcomesFromBoard(boardFromPts(30, 20))
    const summary = buildMorningSummary({
      board: boardFromPts(10, 20),
      previous: {
        outcomes: previousOutcomes,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c", "new-fa"],
      ourDays: [
        {
          date: "2026-10-21",
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-on",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "none",
              addIndex: 1,
              alternativePlayerIds: [],
              targetCategoryIds: ["PTS"],
            },
          ],
        },
      ],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })

    expect(summary.categories).toHaveLength(9)
    expect(summary.categories.find((row) => row.categoryId === "PTS")).toMatchObject({
      outcome: "L",
      flipped: true,
    })
    expect(summary.categories.filter((row) => row.flipped).map((row) => row.categoryId)).toEqual([
      "PTS",
    ])
    expect(summary.opponentMoves).toEqual(["added new-fa"])
    expect(summary.recommendationChanges.length).toBeLessThanOrEqual(3)
  })

  it("leaves change lines empty when nothing factual changed", () => {
    const quiet = buildMorningSummary({
      board: boardFromPts(20, 10),
      previous: {
        outcomes: outcomesFromBoard(boardFromPts(20, 10)),
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(quiet.recommendationChanges).toEqual([])
    expect(quiet.recommendationsUnchanged).toBe(false)
  })

  it("states today's recommendations on the first check and does not mark flips", () => {
    const first = buildMorningSummary({
      board: boardFromPts(20, 10),
      previous: null,
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [
        {
          date: "2026-10-21",
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-on",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "none",
              addIndex: 1,
              alternativePlayerIds: [],
              targetCategoryIds: [],
            },
          ],
        },
      ],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(first.categories.every((row) => row.flipped === false)).toBe(true)
    expect(first.recommendationChanges).toEqual([])
    expect(first.todayRecommendations).toEqual([
      "2026-10-21 add fa-on drop none",
    ])
  })

  it("omits dropped lines for planned opponent drops but reports unexpected drops", () => {
    const opponentDayWithPlannedDrop = {
      date: "2026-10-20",
      streamerPlayerId: "stream-fa",
      droppedPlayerId: null,
      rosterGameCount: 1,
      cells: [
        {
          spotIndex: 0,
          playerId: "stream-fa",
          droppedPlayerId: "planned-drop",
          action: "drop_add" as const,
          addIndex: 1,
        },
      ],
    }
    const summary = buildMorningSummary({
      board: boardFromPts(20, 10),
      previous: {
        outcomes: outcomesFromBoard(boardFromPts(20, 10)),
        opponentRosterIds: ["c", "stream-fa", "planned-drop", "surprise-drop"],
        opponentDays: [opponentDayWithPlannedDrop],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c", "stream-fa"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(summary.opponentMoves).toEqual(["dropped surprise-drop"])
  })

  it("includes a removed saved add in recommendationChanges when PTS flips", () => {
    const previousOutcomes = outcomesFromBoard(boardFromPts(30, 20))
    const summary = buildMorningSummary({
      board: boardFromPts(10, 20),
      previous: {
        outcomes: previousOutcomes,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [identicalAddDay],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(summary.recommendationsUnchanged).toBe(false)
    expect(summary.recommendationChanges).toEqual([
      "2026-10-21 add fa-on drop none",
    ])
  })

  it("includes drop_add when droppedPlayerId changes but added player stays", () => {
    const previousOutcomes = outcomesFromBoard(boardFromPts(30, 20))
    const dropAddCell = (
      droppedPlayerId: string,
    ): (typeof identicalAddDay)["cells"][0] => ({
      spotIndex: 0,
      playerId: "fa-on",
      action: "drop_add",
      droppedPlayerId,
      rosterDropPlayerId: droppedPlayerId,
      rosterDropKind: "stream",
      addIndex: 1,
      alternativePlayerIds: [],
      targetCategoryIds: ["PTS"],
    })
    const summary = buildMorningSummary({
      board: boardFromPts(10, 20),
      previous: {
        outcomes: previousOutcomes,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [
          { date: "2026-10-21", cells: [dropAddCell("old-bench")] },
        ],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [{ date: "2026-10-21", cells: [dropAddCell("new-bench")] }],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(summary.recommendationsUnchanged).toBe(false)
    expect(summary.recommendationChanges).toEqual([
      "2026-10-21 drop_add fa-on drop new-bench",
      "2026-10-21 drop_add fa-on drop old-bench",
    ])
  })

  it("marks recommendations unchanged when PTS flips but today's add matches previous", () => {
    const previousOutcomes = outcomesFromBoard(boardFromPts(30, 20))
    const unchanged = buildMorningSummary({
      board: boardFromPts(10, 20),
      previous: {
        outcomes: previousOutcomes,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [identicalAddDay],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [identicalAddDay],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(unchanged.recommendationsUnchanged).toBe(true)
    expect(unchanged.recommendationChanges).toEqual([])
  })

  it("does not missed-add a future planned opponent add but does for a past plan", () => {
    const opponentAddCell = (date: string) => ({
      date,
      streamerPlayerId: "future-fa",
      droppedPlayerId: null,
      rosterGameCount: 1,
      cells: [
        {
          spotIndex: 0,
          playerId: "future-fa",
          droppedPlayerId: null,
          action: "add" as const,
          addIndex: 1,
        },
      ],
    })
    const base = {
      board: boardFromPts(20, 10),
      previous: {
        outcomes: outcomesFromBoard(boardFromPts(20, 10)),
        opponentRosterIds: ["c"],
        opponentDays: [opponentAddCell("2026-10-22")],
        ourDays: [] as typeof identicalAddDay[],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    }
    const futurePlan = buildMorningSummary(base)
    expect(futurePlan.opponentMoves).not.toContain("missed add future-fa")

    const pastPlan = buildMorningSummary({
      ...base,
      previous: {
        ...base.previous,
        opponentDays: [opponentAddCell("2026-10-20")],
      },
    })
    expect(pastPlan.opponentMoves).toContain("missed add future-fa")
  })

  it("reports dropped when an early drop beats a future planned opponent drop", () => {
    const opponentDayWithFutureDrop = {
      date: "2026-10-22",
      streamerPlayerId: "stream-fa",
      droppedPlayerId: null,
      rosterGameCount: 1,
      cells: [
        {
          spotIndex: 0,
          playerId: "stream-fa",
          droppedPlayerId: "early-drop",
          action: "drop_add" as const,
          addIndex: 1,
        },
      ],
    }
    const summary = buildMorningSummary({
      board: boardFromPts(20, 10),
      previous: {
        outcomes: outcomesFromBoard(boardFromPts(20, 10)),
        opponentRosterIds: ["c", "early-drop"],
        opponentDays: [opponentDayWithFutureDrop],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(summary.opponentMoves).toContain("dropped early-drop")
  })

  it("does not mark flips when saved outcomes fill omitted board categories with ties", () => {
    const you = emptyCategoryTotals()
    const opp = emptyCategoryTotals()
    you.PTS = 30
    opp.PTS = 20
    const ptsOnlyBoard = buildMatchupBoard(you, opp, ["PTS"])
    const savedOutcomes = outcomesFromBoard(ptsOnlyBoard)
    const summary = buildMorningSummary({
      board: ptsOnlyBoard,
      previous: {
        outcomes: savedOutcomes,
        opponentRosterIds: ["c"],
        opponentDays: [],
        ourDays: [],
        sitStart: [],
      },
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(summary.categories.find((row) => row.categoryId === "PTS")).toMatchObject({
      outcome: "W",
      flipped: false,
    })
    for (const categoryId of ALL_CATEGORY_IDS) {
      if (categoryId === "PTS") continue
      expect(summary.categories.find((row) => row.categoryId === categoryId)).toMatchObject({
        outcome: "T",
        flipped: false,
      })
    }
    expect(summary.categories.every((row) => row.flipped === false)).toBe(true)
  })

  it("fills missing board categories with tie outcomes in ALL_CATEGORY_IDS order", () => {
    const you = emptyCategoryTotals()
    const opp = emptyCategoryTotals()
    you.PTS = 30
    opp.PTS = 20
    const ptsOnlyBoard = buildMatchupBoard(you, opp, ["PTS"])
    const summary = buildMorningSummary({
      board: ptsOnlyBoard,
      previous: null,
      closedDays: [],
      currentOpponentRosterIds: ["c"],
      ourDays: [],
      opponentDays: [],
      sitStart: [],
      outPlayerIds: [],
      today: "2026-10-21",
      actualsPending: false,
    })
    expect(summary.categories.map((row) => row.categoryId)).toEqual([
      ...ALL_CATEGORY_IDS,
    ])
    expect(summary.categories).toHaveLength(9)
    expect(summary.categories.find((row) => row.categoryId === "PTS")?.outcome).toBe(
      "W",
    )
    for (const categoryId of ALL_CATEGORY_IDS) {
      if (categoryId === "PTS") continue
      expect(summary.categories.find((row) => row.categoryId === categoryId)).toMatchObject({
        outcome: "T",
        flipped: false,
      })
    }
  })
})
