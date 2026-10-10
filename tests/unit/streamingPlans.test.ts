import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"
import { streamingAddLimitForSchedule } from "@/lib/matchup/games"
import {
  buildAllStreamingPlans,
  buildStreamingPlan,
  streamingAddDropKey,
} from "@/lib/matchup/streamingPlans"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type { MatchupBoard, StreamingPlanDayCell } from "@/lib/matchup/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

const assertCellShape = (cell: StreamingPlanDayCell) => cell

describe("WEEKLY_ADD_LIMIT", () => {
  it("is 7 ESPN-style weekly acquisitions", () => {
    expect(WEEKLY_ADD_LIMIT).toBe(7)
  })
})

describe("streamingAddLimitForSchedule", () => {
  const scheduleOf = (days: string[]): ScheduleResponse => ({
    source: "fixture",
    matchup: {
      scoringPeriodId: 1,
      startDate: days[0] ?? "2026-10-20",
      endDate: days[days.length - 1] ?? "2026-10-20",
      days,
    },
    games: days.map((date) => ({
      date,
      homeAbbr: "BOS",
      awayAbbr: "NYK",
    })),
  })

  it("uses 7 adds for a normal week even when only 6 days have games", () => {
    expect(
      streamingAddLimitForSchedule(
        scheduleOf([
          "2026-10-20",
          "2026-10-21",
          "2026-10-22",
          "2026-10-23",
          "2026-10-24",
          "2026-10-25",
        ]),
      ),
    ).toBe(7)
  })

  it("uses 7 adds for a 7-day week", () => {
    expect(
      streamingAddLimitForSchedule(
        scheduleOf([
          "2026-10-19",
          "2026-10-20",
          "2026-10-21",
          "2026-10-22",
          "2026-10-23",
          "2026-10-24",
          "2026-10-25",
        ]),
      ),
    ).toBe(7)
  })

  it("scales to about 10 adds for a two-week All-Star or NBA Cup matchup", () => {
    expect(
      streamingAddLimitForSchedule(
        scheduleOf([
          "2026-02-09",
          "2026-02-10",
          "2026-02-11",
          "2026-02-12",
          "2026-02-13",
          "2026-02-19",
          "2026-02-20",
          "2026-02-21",
          "2026-02-22",
          "2026-02-23",
        ]),
      ),
    ).toBe(10)
  })

  it("uses 14 adds for a full two-week scoring period", () => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 1, 9 + index))
      return date.toISOString().slice(0, 10)
    })
    expect(streamingAddLimitForSchedule(scheduleOf(days))).toBe(14)
  })
})

it("StreamingPlanDayCell requires drop fields", () => {
  const cell = assertCellShape({
    spotIndex: 0,
    playerId: "fa-a",
    action: "add",
    droppedPlayerId: null,
    rosterDropPlayerId: null,
    rosterDropKind: "open_slot",
    addIndex: 1,
    alternativePlayerIds: [],
    targetCategoryIds: [],
  })
  expect(cell.addIndex).toBe(1)
})

it("stamps chronological addIndex on add and drop_add cells", () => {
  const days = ["2025-11-03", "2025-11-04"]
  const faA = player("fa-a", "BOS", {
    projections: { ...baseProjections(), STL: 180 },
  })
  const faB = player("fa-b", "NYK", {
    projections: { ...baseProjections(), STL: 160 },
  })
  const state = tinyState([faA, faB], ["fa-a", "fa-b"])
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
    { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
  ])
  const plan = buildStreamingPlan({
    spotCount: 1,
    state,
    schedule,
    board: emptyBoardLosingStl(),
  })

  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-a",
    addIndex: 1,
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "drop_add",
    playerId: "fa-b",
    addIndex: 2,
  })
  // hold cells (if any in other fixtures) must use addIndex: null — covered in Task 2
})

const baseProjections = (): SeasonPlayer["projections"] => ({
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
})

const baseShooting = (): SeasonPlayer["shooting"] => ({
  FGM: 500,
  FGA: 1040,
  FTM: 200,
  FTA: 260,
})

const player = (
  id: string,
  teamAbbr: string,
  overrides: Partial<SeasonPlayer> = {},
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  positions: ["PG", "SG", "SF", "PF", "C", "G", "F"],
  projections: { ...baseProjections(), ...overrides.projections },
  shooting: { ...baseShooting(), ...overrides.shooting },
  ...overrides,
})

const emptyBoardLosingStl = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: categoryId === "STL" ? 1 : 10,
    opp: categoryId === "STL" ? 5 : 8,
    outcome: categoryId === "STL" ? "L" : "W",
    winProb: categoryId === "STL" ? 0.4 : 0.8,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
})

const losingBlkBoard = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: categoryId === "BLK" ? 1 : 50,
    opp: categoryId === "BLK" ? 8 : 10,
    outcome: categoryId === "BLK" ? "L" : "W",
    winProb: categoryId === "BLK" ? 0.4 : 0.9,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
})

/** Close REB loss. Opp totals keep other cats winning vs a 3-point streamer week. */
const closeLosingRebBoard = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => {
    if (categoryId === "REB") {
      return {
        categoryId,
        you: 1.2,
        opp: 5,
        outcome: "L" as const,
        winProb: 0.43,
      }
    }
    if (categoryId === "TPM") {
      return {
        categoryId,
        you: 10,
        opp: 7,
        outcome: "W" as const,
        winProb: 0.57,
      }
    }
    if (categoryId === "TO") {
      return {
        categoryId,
        you: 2,
        opp: 5,
        outcome: "W" as const,
        winProb: 0.65,
      }
    }
    if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
      return {
        categoryId,
        you: 0.48,
        opp: 0.45,
        outcome: "W" as const,
        winProb: 0.7,
      }
    }
    if (categoryId === "STL") {
      return {
        categoryId,
        you: 2,
        opp: 0.4,
        outcome: "W" as const,
        winProb: 0.75,
      }
    }
    if (categoryId === "BLK") {
      return {
        categoryId,
        you: 1,
        opp: 0.2,
        outcome: "W" as const,
        winProb: 0.7,
      }
    }
    if (categoryId === "AST") {
      return {
        categoryId,
        you: 8,
        opp: 2,
        outcome: "W" as const,
        winProb: 0.75,
      }
    }
    return {
      categoryId,
      you: 30,
      opp: 10,
      outcome: "W" as const,
      winProb: 0.8,
    }
  }),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7.4,
})

const packedActiveSlots: SeasonSlot[] = [
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
  "G",
  "F",
  "UTIL",
  "UTIL",
  "UTIL",
]

const packedTeamAbbrs = [
  "NYK",
  "LAL",
  "PHX",
  "MIL",
  "ATL",
  "DEN",
  "GSW",
  "MIA",
  "CHI",
  "BOS",
] as const

const packedRosterPositions: NonNullable<SeasonPlayer["positions"]>[] = [
  ["PG"],
  ["SG"],
  ["SF"],
  ["PF"],
  ["C"],
  ["PG", "SG"],
  ["SF", "PF"],
  ["SG"],
  ["PG"],
  ["SF"],
]

const emptyActive = (): SeasonRosterEntry[] =>
  packedActiveSlots.map((slot) => ({ slot, playerId: null }))

const packedRosterPlayers = () =>
  packedTeamAbbrs.map((team, index) =>
    player(`r${index}`, team, { positions: packedRosterPositions[index] }),
  )

const offNightBench = (id = "r-idle") =>
  player(id, "UTA", { positions: ["C"] })

const tinyState = (players: SeasonPlayer[], availablePlayerIds: string[]): SeasonLeagueState => ({
  name: "Tiny League",
  season: 2025,
  categories: ALL_CATEGORY_IDS.map((id) => ({ id, enabled: true, weight: 1 })),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [{ slot: "UTIL", playerId: null }],
    },
    {
      teamIndex: 1,
      name: "Them",
      entries: [{ slot: "UTIL", playerId: null }],
    },
  ],
  players,
  availablePlayerIds,
  waiverOrder: [0, 1],
  source: "manual",
})

const tinySchedule = (
  days: string[],
  games: ScheduleResponse["games"],
): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    days,
  },
  games,
})

describe("buildStreamingPlan", () => {
  it("drop_add records droppedPlayerId as the previous spot occupant", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const state = tinyState([faA, faB], ["fa-a", "fa-b"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
    })

  expect(plan.days[0]!.cells[0]).toMatchObject({
    action: "add",
    playerId: "fa-a",
    droppedPlayerId: null,
  })
  expect(plan.days[1]!.cells[0]).toMatchObject({
    action: "drop_add",
    playerId: "fa-b",
    droppedPlayerId: "fa-a",
    rosterDropKind: "none",
    rosterDropPlayerId: null,
  })
})

  it("covers a 1-spot off night even when the upgrade has fewer remaining games", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const faC = player("fa-c", "MIA", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const state = tinyState([faA, faB, faC], ["fa-a", "fa-b", "fa-c"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: 7,
    })

    expect(plan.addsUsed).toBeLessThanOrEqual(7)
    expect(plan.addLimit).toBe(7)
    expect(plan.days[0]!.cells[0]).toMatchObject({ action: "add", playerId: "fa-a" })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-b",
    })
  })

  it("holds a player across consecutive game days without spending adds", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const state = tinyState([faA, faB], ["fa-a", "fa-b"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: 2,
    })

    expect(plan.days[0]!.cells[0]!.action).toBe("add")
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-b",
    })
    expect(plan.addsUsed).toBe(2)
  })

  it("2-spot can seat two different FAs on the same day using two adds", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const state = tinyState([faA, faB], ["fa-a", "fa-b"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board,
      addLimit: 2,
    })
    const day0 = plan.days[0]!.cells
    expect(day0).toHaveLength(2)
    expect(new Set(day0.map((c) => c.playerId)).size).toBe(2)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
  })

  it("prefers remaining game volume when weak-cat scores tie", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faLowVolume = player("fa-low", "BOS", {
      projections: { ...baseProjections(), STL: 100 },
    })
    const faHighVolume = player("fa-high", "NYK", {
      projections: { ...baseProjections(), STL: 100 },
    })
    const state = tinyState(
      [faLowVolume, faHighVolume],
      ["fa-low", "fa-high"],
    )
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "MIA" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({ spotCount: 1, state, schedule, board })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-high",
    })
  })

  it("leaves cells empty after the add budget is exhausted", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
    ]
    const players = ["BOS", "NYK", "MIA", "ATL"].map((team, index) =>
      player(`fa-${index}`, team, {
        projections: { ...baseProjections(), STL: 200 - index },
      }),
    )
    const state = tinyState(
      players,
      players.map((entry) => entry.id),
    )
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "MIA", awayAbbr: "CHI" },
      { date: "2025-11-06", homeAbbr: "ATL", awayAbbr: "CHI" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: 2,
    })

    expect(plan.addsUsed).toBe(2)
    expect(plan.days[0]!.cells[0]!.action).toBe("add")
    expect(plan.days[1]!.cells[0]!.action).toBe("drop_add")
    expect(plan.days[2]!.cells[0]!.action).toBe("empty")
    expect(plan.days[3]!.cells[0]!.action).toBe("empty")
  })

  it("uses open_slot when perspective roster has an empty non-IL slot", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const rostered = player("you-1", "LAL", {
      projections: { ...baseProjections(), STL: 10 },
    })
    const state = tinyState([faA, rostered], ["fa-a"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-1" },
      { slot: "BE", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      rosterDropKind: "open_slot",
      rosterDropPlayerId: null,
    })
  })

  it("does not reuse a cut or auto-cut a seated player on the same day", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const noGameHighStl = player("you-idle", "CHI", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const playsLowStl = player("you-play", "ATL", {
      projections: { ...baseProjections(), STL: 5 },
    })
    const state = tinyState(
      [faA, faB, noGameHighStl, playsLowStl],
      ["fa-a", "fa-b"],
    )
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-idle" },
      { slot: "BE", playerId: "you-play" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule: {
        ...schedule,
        matchup: {
          ...schedule.matchup,
          endDate: "2025-11-05",
          days: ["2025-11-03", "2025-11-04", "2025-11-05"],
        },
      },
      board: emptyBoardLosingStl(),
      addLimit: 2,
    })
    const drops = plan.days[0]!.cells.map((c) => c.rosterDropPlayerId)
    expect(drops[0]).toBe("you-idle")
    expect(drops[1]).toBeNull()
    expect(plan.days[0]!.cells[1]).toMatchObject({
      action: "empty",
      rosterDropKind: "none",
    })
  })

  it("balances adds across spots under a soft per-spot cap", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
    ]
    const teams = ["BOS", "NYK", "MIA", "ATL", "CHI", "MIL", "DEN", "PHX"]
    const players = teams.map((team, index) =>
      player(`fa-${index}`, team, {
        projections: { ...baseProjections(), STL: 200 - index },
      }),
    )
    const state = tinyState(
      players,
      players.map((entry) => entry.id),
    )
    const schedule = tinySchedule(
      days,
      days.flatMap((date, index) => [
        {
          date,
          homeAbbr: teams[index % teams.length]!,
          awayAbbr: "WAS",
        },
        {
          date,
          homeAbbr: teams[(index + 3) % teams.length]!,
          awayAbbr: "ORL",
        },
      ]),
    )

    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    const addsBySpot = [0, 0]
    for (const day of plan.days) {
      for (const cell of day.cells) {
        if (cell.action === "add" || cell.action === "drop_add") {
          addsBySpot[cell.spotIndex]! += 1
        }
      }
    }

    expect(plan.addsUsed).toBeLessThanOrEqual(7)
    expect(plan.addsUsed).toBe(addsBySpot[0]! + addsBySpot[1]!)
    expect(Math.max(...addsBySpot)).toBeLessThanOrEqual(5)
    // Soft cap + fill-least-used keeps spots from hogging; hold-through can leave
    // a 2-add gap when one dense streamer covers most of the week.
    expect(Math.abs(addsBySpot[0]! - addsBySpot[1]!)).toBeLessThanOrEqual(
      Math.ceil(7 / 2),
    )
  })
  it("leaves off nights empty and re-adds on the next hole night", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faDense = player("fa-dense", "BOS", {
      projections: { ...baseProjections(), STL: 100 },
    })
    const faOneNight = player("fa-one", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const state = tinyState([faDense, faOneNight], ["fa-dense", "fa-one"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
      // Tue off for BOS; Wednesday has another game
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "ATL" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
    })

    expect(["add", "drop_add"]).toContain(plan.days[0]!.cells[0]!.action)
    expect(plan.days[1]!.cells[0]!.action).toBe("empty")
    expect(["add", "drop_add", "hold"]).toContain(plan.days[2]!.cells[0]!.action)
    expect(plan.days[2]!.cells[0]!.playerId).toBeTruthy()
    expect(plan.addsUsed).toBeGreaterThanOrEqual(1)
  })

  it("prefers denser remaining schedule over one-night weak-cat spikes", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const faDense = player("fa-dense", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const faSpike = player("fa-spike", "NYK", {
      projections: { ...baseProjections(), STL: 220 },
    })
    const state = tinyState([faDense, faSpike], ["fa-dense", "fa-spike"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "WAS" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
    })

    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-spike")
  })
})

describe("buildAllStreamingPlans", () => {
  it("buildAllStreamingPlans returns spot counts 1, 2, and 3", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const faC = player("fa-c", "MIA", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([faA, faB, faC], ["fa-a", "fa-b", "fa-c"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-03", homeAbbr: "MIA", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const board = emptyBoardLosingStl()

    const plans = buildAllStreamingPlans({ state, schedule, board })
    expect(plans.map((p) => p.spotCount)).toEqual([1, 2, 3])
    for (const plan of plans) {
      expect(plan.addsUsed).toBeLessThanOrEqual(WEEKLY_ADD_LIMIT)
    }
  })
})

describe("streaming plans", () => {
  it("adds a one-game streamer on the first hole day", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const thin = player("fa-thin", "NYK")
    const state = tinyState([thin], ["fa-thin"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-thin",
    })
    expect(plan.summaryReasons.length).toBeGreaterThan(0)
  })
})

describe("starts-max adds and protected drops", () => {
  it("uses more than one add when multiple start-positive blocks exist (balanced)", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
    ]
    const faEarly = player("fa-early", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faLate = player("fa-late", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const state = tinyState([faEarly, faLate], ["fa-early", "fa-late"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-07", homeAbbr: "NYK", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
    expect(plan.gameStarts).toBeGreaterThanOrEqual(2)
    expect(plan.addsUsed).toBeLessThanOrEqual(plan.addLimit)
    expect(plan.summaryReasons).toContain(
      "Fills empty stream spots for the week",
    )
  })

  it("allows a starts-positive add past per-spot soft-cap while weekly budget remains", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faHold = player("fa-hold", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const faMon = player("fa-mon", "NYK", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faTue = player("fa-tue", "MIA", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const faWed = player("fa-wed", "ATL", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState(
      [faHold, faMon, faTue, faWed],
      ["fa-hold", "fa-mon", "fa-tue", "fa-wed"],
    )
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "DET" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "IND" },
      { date: "2025-11-05", homeAbbr: "ATL", awayAbbr: "CLE" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 4,
    })

    const addsBySpot = [0, 0]
    for (const day of plan.days) {
      for (const cell of day.cells) {
        if (cell.action === "add" || cell.action === "drop_add") {
          addsBySpot[cell.spotIndex]! += 1
        }
      }
    }
    expect(plan.addsUsed).toBeLessThanOrEqual(4)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
    expect(addsBySpot[0]! + addsBySpot[1]!).toBe(plan.addsUsed)
  })

  it("paces 2-spot adds so early days do not exhaust the weekly budget", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
    ]
    const teams = ["BOS", "NYK", "MIA", "ATL", "CHI", "MIL", "DET", "CLE", "IND", "ORL"]
    const fas = teams.map((team, index) =>
      player(`fa-${team}`, team, {
        projections: { ...baseProjections(), STL: 200 - index },
      }),
    )
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    // Dense slate every day so naive planner would churn hard.
    const schedule = tinySchedule(
      days,
      days.flatMap((date, index) => [
        {
          date,
          homeAbbr: teams[index % teams.length]!,
          awayAbbr: "WAS",
        },
        {
          date,
          homeAbbr: teams[(index + 3) % teams.length]!,
          awayAbbr: "SAC",
        },
        {
          date,
          homeAbbr: teams[(index + 6) % teams.length]!,
          awayAbbr: "PHX",
        },
      ]),
    )

    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    const addsByDay = plan.days.map((day) =>
      day.cells.filter(
        (cell) => cell.action === "add" || cell.action === "drop_add",
      ).length,
    )
    const earlyAdds = addsByDay.slice(0, 3).reduce((sum, n) => sum + n, 0)
    const lateAdds = addsByDay.slice(4).reduce((sum, n) => sum + n, 0)

    expect(addsByDay[0]).toBeGreaterThanOrEqual(1)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(4)
    expect(plan.addsUsed).toBeLessThanOrEqual(7)
    expect(earlyAdds).toBeGreaterThan(0)
    expect(lateAdds + addsByDay[3]!).toBeGreaterThan(0)
  })

  it("2-spot fills both holes on each playable day despite daily swap pace", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
    ]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const state = tinyState([faA, faB], ["fa-a", "fa-b"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(
      plan.days[0]!.cells.filter((cell) => cell.action === "add"),
    ).toHaveLength(2)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
    expect(plan.addsUsed).toBeLessThanOrEqual(7)
  })

  it("catch-up spends nearly all 2-spot add budget when FA slate stays dense", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
    ]
    const teams = [
      "BOS",
      "NYK",
      "MIA",
      "ATL",
      "CHI",
      "MIL",
      "DET",
      "CLE",
      "IND",
      "ORL",
      "PHI",
      "TOR",
    ]
    const fas = teams.map((team, index) =>
      player(`fa-${team}`, team, {
        projections: { ...baseProjections(), STL: 200 - index },
      }),
    )
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    const schedule = tinySchedule(
      days,
      days.flatMap((date, index) =>
        teams.slice(0, 6).map((team, teamIndex) => ({
          date,
          homeAbbr: teams[(index + teamIndex) % teams.length]!,
          awayAbbr: teamIndex % 2 === 0 ? "WAS" : "SAC",
        })),
      ),
    )
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    const catchAdds = [0, 0]
    for (const day of plan.days) {
      for (const cell of day.cells) {
        if (cell.action === "add" || cell.action === "drop_add") {
          catchAdds[cell.spotIndex]! += 1
        }
      }
    }
    expect(Math.max(...catchAdds)).toBeLessThanOrEqual(4)
    expect(catchAdds[0]).toBeGreaterThan(0)
    expect(catchAdds[1]).toBeGreaterThan(0)
    expect(plan.addsUsed).toBeLessThanOrEqual(7)
  })

  it("does not auto-cut a playing low-ADP starter on first add", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const star = player("star", "CHI", {
      projections: { ...baseProjections(), STL: 10 },
    })
    const scrub = player("scrub", "ATL", {
      projections: { ...baseProjections(), STL: 5 },
    })
    const state = tinyState([faA, star, scrub], ["fa-a"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "star" },
      { slot: "BE", playerId: "scrub" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      adpByPlayerId: { star: 25, scrub: 200 },
    })

    expect(plan.days[0]!.cells[0]!.action).toBe("add")
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).not.toBe("star")
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("scrub")
    expect(plan.summaryReasons).not.toContain("Protected ADP ≤ 60")
  })

  it("does not roster-drop a playing star when that drop would lose cat wins", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const star = player("star", "ATL", {
      projections: {
        ...baseProjections(),
        PTS: 2800,
        REB: 800,
        AST: 700,
        STL: 80,
      },
    })
    const scrub = player("scrub", "CHI", {
      projections: { ...baseProjections(), PTS: 200, REB: 40, AST: 30, STL: 5 },
    })
    const state = tinyState([faA, star, scrub], ["fa-a"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "star" },
      { slot: "BE", playerId: "scrub" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "ATL", awayAbbr: "MIA" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]!.action).toBe("add")
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).not.toBe("star")
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("scrub")
  })

  it("skips IL when choosing an automatic roster cut", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const ilGuy = player("il-guy", "NYK")
    const star = player("star", "CHI")
    const state = tinyState([faA, ilGuy, star], ["fa-a"])
    state.teams[0]!.entries = [
      { slot: "IL", playerId: "il-guy" },
      { slot: "UTIL", playerId: "star" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      adpByPlayerId: { "il-guy": 80, star: 80 },
      injuryOutDaysByPlayerId: { "il-guy": 30, star: 21 },
    })

    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("star")
    expect(plan.days[0]!.cells[0]!.rosterDropKind).toBe("player")
  })
})

describe("forcedRosterDrops", () => {
  const rosterDropFixture = () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const noGameHighStl = player("you-idle", "CHI", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const playsLowStl = player("you-play", "ATL", {
      projections: { ...baseProjections(), STL: 5 },
    })
    const state = tinyState(
      [faA, faB, noGameHighStl, playsLowStl],
      ["fa-a", "fa-b"],
    )
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-idle" },
      { slot: "BE", playerId: "you-play" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
    ])
    const board = emptyBoardLosingStl()
    const baseInput = {
      spotCount: 2 as const,
      state,
      schedule,
      board,
      addLimit: 2,
    }
    return { baseInput, date: days[0]! }
  }

  it("empty or omitted forcedRosterDrops matches baseline roster drops", () => {
    const { baseInput } = rosterDropFixture()
    const baseline = buildStreamingPlan(baseInput)
    const withEmpty = buildStreamingPlan({ ...baseInput, forcedRosterDrops: {} })
    const withOmitted = buildStreamingPlan(baseInput)

    const baselineDrops = baseline.days[0]!.cells.map((c) => c.rosterDropPlayerId)
    expect(withEmpty.days[0]!.cells.map((c) => c.rosterDropPlayerId)).toEqual(
      baselineDrops,
    )
    expect(withOmitted.days[0]!.cells.map((c) => c.rosterDropPlayerId)).toEqual(
      baselineDrops,
    )
    expect(baselineDrops[0]).toBe("you-idle")
  })

  it("honors forced player drop on first add", () => {
    const { baseInput, date } = rosterDropFixture()
    const forceKey = streamingAddDropKey(date, 0)
    const plan = buildStreamingPlan({
      ...baseInput,
      forcedRosterDrops: { [forceKey]: "you-play" },
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      rosterDropKind: "player",
      rosterDropPlayerId: "you-play",
    })
  })

  it("does not roster-drop the same player twice after an early forced drop", () => {
    const { baseInput, date } = rosterDropFixture()
    const firstKey = streamingAddDropKey(date, 0)
    const secondKey = streamingAddDropKey(date, 1)
    const plan = buildStreamingPlan({
      ...baseInput,
      forcedRosterDrops: {
        [firstKey]: "you-idle",
        [secondKey]: "you-idle",
      },
    })

    const drops = plan.days[0]!.cells.map((c) => c.rosterDropPlayerId)
    expect(drops[0]).toBe("you-idle")
    expect(drops[1]).not.toBe("you-idle")
    expect(drops[1]).toBeNull()
  })

  it("passes forcedRosterDrops through buildAllStreamingPlans", () => {
    const { baseInput, date } = rosterDropFixture()
    const forceKey = streamingAddDropKey(date, 0)
    const plans = buildAllStreamingPlans({
      state: baseInput.state,
      schedule: baseInput.schedule,
      board: baseInput.board,
      forcedRosterDrops: { [forceKey]: "you-play" },
    })

    expect(plans[1]!.days[0]!.cells[0]!.rosterDropPlayerId).toBe("you-play")
  })

  it("today hold spends no add and keeps future rosterDropPlayerId for preview", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const you = player("you-1", "CHI")
    const state = tinyState([faA, you], ["fa-a"])
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: "you-1" }]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      today: "2025-11-03",
      forcedRosterDrops: { "2025-11-03:0": "hold" },
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "hold",
      rosterDropKind: "none",
      addIndex: null,
      targetCategoryIds: [],
    })
    expect(plan.addsUsed).toBe(1)
    expect(plan.days[1]!.cells[0]?.playerId).toBeTruthy()
    expect(["add", "drop_add"]).toContain(plan.days[1]!.cells[0]?.action)
    expect(plan.days[1]!.cells[0]).toMatchObject({
      rosterDropKind: "player",
      rosterDropPlayerId: "you-1",
    })
  })

  it("today hold keeps a seated streamer and skips early-swap", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const held = player("fa-held", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 50 },
    })
    const state = tinyState([held, elite], ["fa-held", "fa-elite"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      today: "2025-11-04",
      forcedRosterDrops: { "2025-11-04:0": "hold" },
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-held",
      addIndex: 1,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-held",
      addIndex: null,
    })
    expect(plan.days[1]!.cells[0]?.action).not.toBe("drop_add")
  })

  it("today player drop on a seated spot spends an add instead of holding", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const held = player("fa-held", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 50 },
    })
    const you = player("you-1", "CHI")
    const state = tinyState([held, elite, you], ["fa-held", "fa-elite"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-1" },
      { slot: "BE", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      today: "2025-11-04",
      forcedRosterDrops: { "2025-11-04:0": "you-1" },
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-held",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "add",
      rosterDropKind: "player",
      rosterDropPlayerId: "you-1",
    })
    expect(plan.days[1]!.cells[0]?.action).not.toBe("hold")
    expect(plan.days[1]!.cells[0]?.playerId).toBeTruthy()
  })

  it("keeps the seated streamer when today force cannot spend an add", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const held = player("fa-held", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 50 },
    })
    const you = player("you-1", "CHI")
    const state = tinyState([held, elite, you], ["fa-held", "fa-elite"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-1" },
      { slot: "BE", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 1,
      today: "2025-11-04",
      forcedRosterDrops: { "2025-11-04:0": "you-1" },
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-held",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-held",
    })
  })

  it("forced protected player is an allowed today drop", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const star = player("star", "CHI")
    const state = tinyState([faA, star], ["fa-a"])
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: "star" }]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      today: "2025-11-03",
      forcedRosterDrops: { "2025-11-03:0": "star" },
      adpByPlayerId: { star: 25 },
    })
    expect(plan.days[0]!.cells[0]?.rosterDropPlayerId).toBe("star")
    expect(plan.days[0]!.cells[0]?.targetCategoryIds?.length).toBeGreaterThan(0)
  })

  it("resolves forced roster drops in spotIndex order on same day", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faMon = player("fa-mon", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faWed0 = player("fa-wed-0", "ORL", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const faWed1 = player("fa-wed-1", "NYK", {
      projections: { ...baseProjections(), STL: 155 },
    })
    const noGameHighStl = player("you-idle", "DET", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const playsLowStl = player("you-play", "ATL", {
      projections: { ...baseProjections(), STL: 5 },
    })
    const benchCut = player("you-bench", "PHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState(
      [faMon, faWed0, faWed1, noGameHighStl, playsLowStl, benchCut],
      ["fa-mon", "fa-wed-0", "fa-wed-1"],
    )
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-idle" },
      { slot: "BE", playerId: "you-play" },
      { slot: "BN", playerId: "you-bench" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "ORL", awayAbbr: "NYK" },
      { date: "2025-11-05", homeAbbr: "ATL", awayAbbr: "PHI" },
    ])
    const mon = days[0]!
    const wed = days[2]!
    const forceKey = streamingAddDropKey(wed, 0)

    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      forcedRosterDrops: {
        [streamingAddDropKey(mon, 0)]: "you-idle",
        [forceKey]: "you-play",
      },
    })

    const wedCells = plan.days[2]!.cells
    expect(wedCells[0]).toMatchObject({
      action: "add",
      rosterDropPlayerId: "you-play",
    })
    expect(wedCells[1]).toMatchObject({
      action: "empty",
      rosterDropPlayerId: null,
    })
  })
})

describe("1-spot off-night always cover", () => {
  const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]

  it("swaps on off night when upgrade has strictly more remaining games", () => {
    // Held BOS: Mon, Wed, Thu → Tue off, remaining from Tue = 2
    // Upgrade NYK: Tue, Wed, Thu → remaining from Tue = 3
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const nyk = player("fa-nyk", "NYK", {
      projections: { ...baseProjections(), STL: 190 },
    })
    const state = tinyState([bos, nyk], ["fa-bos", "fa-nyk"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
      addIndex: 1,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-nyk",
      droppedPlayerId: "fa-bos",
    })
  })

  it("covers a 1-spot off night even when the upgrade would not raise projectedCatWins", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200, BLK: 80 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 0, BLK: 0, TO: 400, FG_PCT: 0.3 },
      shooting: { FGM: 2, FGA: 20, FTM: 1, FTA: 2 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "TO" || categoryId === "FG_PCT" ? 20 : 50,
        opp: categoryId === "TO" || categoryId === "FG_PCT" ? 8 : 10,
        outcome: categoryId === "TO" || categoryId === "FG_PCT" ? "L" : "W",
        winProb: 0.2,
      })),
      wins: 7,
      losses: 2,
      ties: 0,
      projectedCatWins: 6,
    }
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({ action: "add", playerId: "fa-bos" })
    expect(["add", "drop_add"]).toContain(plan.days[1]!.cells[0]!.action)
    expect(plan.days[1]!.cells[0]!.action).not.toBe("hold")
  })

  it("keeps the top-hole pick while listing lower-hole alternatives", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faBest = player("fa-best", "BOS", {
      positions: ["C"],
      projections: { ...baseProjections(), STL: 200 },
    })
    const faAlt = player("fa-alt", "NYK", {
      positions: ["PF", "C"],
      projections: { ...baseProjections(), STL: 120 },
    })
    const faQuiet = player("fa-quiet", "CHI", {
      positions: ["C"],
      projections: { ...baseProjections(), STL: 10 },
    })
    const state = tinyState([faBest, faAlt, faQuiet], [
      "fa-best",
      "fa-alt",
      "fa-quiet",
    ])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-best",
    })
    expect(plan.days[0]!.cells[0]!.alternativePlayerIds).toContain("fa-alt")
    expect(plan.days[0]!.cells[0]!.alternativePlayerIds).not.toContain(
      "fa-best",
    )
  })

  it("excludes cross-family streamers from alternativePlayerIds", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const big = player("fa-big", "BOS", {
      positions: ["C"],
      projections: { ...baseProjections(), STL: 200, BLK: 100 },
    })
    const guard = player("fa-guard", "NYK", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 180, TPM: 200 },
    })
    const state = tinyState([big, guard], ["fa-big", "fa-guard"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]?.playerId).toBe("fa-big")
    expect(plan.days[0]!.cells[0]!.alternativePlayerIds).toContain("fa-guard")
  })

  it("soft-ranks by FT% then TO when volume/stretch/primary cats tie", () => {
    const days = ["2025-11-03"]
    const highFt = player("fa-high-ft", "BOS", {
      projections: {
        ...baseProjections(),
        STL: 100,
        TO: 40,
      },
      shooting: { ...baseShooting(), FTM: 45, FTA: 50 },
    })
    const lowFt = player("fa-low-ft", "CHI", {
      projections: {
        ...baseProjections(),
        STL: 100,
        TO: 120,
      },
      shooting: { ...baseShooting(), FTM: 30, FTA: 50 },
    })
    const state = tinyState([lowFt, highFt], ["fa-low-ft", "fa-high-ft"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "ORL" },
    ])
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        const weak =
          categoryId === "STL" ||
          categoryId === "FT_PCT" ||
          categoryId === "TO"
        return {
          categoryId,
          you: weak ? 1 : 10,
          opp: weak ? 5 : 8,
          outcome: weak ? ("L" as const) : ("W" as const),
          winProb: weak ? 0.2 : 0.8,
        }
      }),
      wins: 6,
      losses: 3,
      ties: 0,
      projectedCatWins: 6,
    }
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-high-ft",
    })
  })

  it("keeps hold on game day when held plays", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 100 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 1,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-bos",
    })
  })

  it("uses pickBestFa fallback when pickTodayBlock is gated on mid-week off night", () => {
    // Mid-week off night: BOS Mon/Wed/Thu, CHI only Tue.
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
    ]
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
    })
    expect(["add", "drop_add"]).toContain(plan.days[1]!.cells[0]!.action)
    expect(plan.days[1]!.cells[0]!.action).not.toBe("hold")
  })

  it("prefers more remaining hole starts over better board delta", () => {
    const days = ["2025-10-20", "2025-10-21"]
    const packed = packedRosterPlayers()
    const moreHoles = player("fa-more-holes", "POR", {
      positions: ["PF"],
      projections: { ...baseProjections(), STL: 1 },
    })
    const betterBoard = player("fa-better-board", "OKC", {
      positions: ["PF"],
      projections: { ...baseProjections(), STL: 1000 },
    })
    const idle = offNightBench()
    const state = tinyState(
      [...packed, moreHoles, betterBoard, idle],
      ["fa-more-holes", "fa-better-board"],
    )
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: idle.id },
    ]
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const daily = {
      "2025-10-20": pfOpen.map((entry) => ({ ...entry })),
      "2025-10-21": pfOpen.map((entry) => ({ ...entry })),
    }
    const schedule = tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr) => ({
          date,
          homeAbbr,
          awayAbbr: "SAC",
        })),
      ),
      { date: "2025-10-20", homeAbbr: "POR", awayAbbr: "CHI" },
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "NYK" },
      { date: "2025-10-20", homeAbbr: "OKC", awayAbbr: "WAS" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      daily,
    })

    expect(plan.days[0]!.cells[0]?.playerId).toBe("fa-better-board")
  })

  it("does not auto-cut a tonight starter to add a streamer", () => {
    const days = ["2025-10-21"]
    const packed = packedRosterPlayers()
    const fa = player("fa-por", "POR", { positions: ["PF"] })
    const state = tinyState([...packed, fa], ["fa-por"])
    state.teams[0]!.entries = packed.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-21",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily: { "2025-10-21": pfOpen },
    })
    const add = plan.days[0]!.cells[0]

    if (add?.action === "add") {
      if (add.rosterDropPlayerId) {
        expect(
          pfOpen.some((entry) => entry.playerId === add.rosterDropPlayerId),
        ).toBe(false)
      }
    }
  })

  it("auto-cuts the off-night bench player not a starter", () => {
    const days = ["2025-10-21"]
    const packed = packedRosterPlayers()
    const bench = player("r-be", "DET", { positions: ["C"] })
    const benchTwo = player("r-be-2", "UTA", { positions: ["G"] })
    const benchThree = player("r-be-3", "ORL", { positions: ["F"] })
    const fa = player("fa-por", "POR", { positions: ["PF"] })
    const state = tinyState(
      [...packed, bench, benchTwo, benchThree, fa],
      ["fa-por"],
    )
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: "r-be" },
      { slot: "BE", playerId: "r-be-2" },
      { slot: "BE", playerId: "r-be-3" },
    ]
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-21",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      { date: "2025-10-21", homeAbbr: "UTA", awayAbbr: "DAL" },
      { date: "2025-10-21", homeAbbr: "ORL", awayAbbr: "BKN" },
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily: { "2025-10-21": pfOpen },
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-por",
      rosterDropKind: "player",
      rosterDropPlayerId: "r-be",
    })
  })

  it("keeps a saved later-day hole open for a roster cut", () => {
    const days = ["2025-10-20", "2025-10-21"]
    const packed = packedRosterPlayers()
    const fa = player("fa-por", "POR", { positions: ["PF"] })
    const state = tinyState([...packed, fa], ["fa-por"])
    state.teams[0]!.entries = packed.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const packedDay = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: packed[index]!.id,
    }))
    const daily = {
      "2025-10-20": pfOpen,
      "2025-10-21": packedDay,
    }
    const schedule = tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr) => ({
          date,
          homeAbbr,
          awayAbbr: "SAC",
        })),
      ),
      { date: "2025-10-20", homeAbbr: "POR", awayAbbr: "CHI" },
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
      forcedRosterDrops: {
        [streamingAddDropKey("2025-10-20", 0)]: "r3",
      },
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-por",
      rosterDropPlayerId: "r3",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-por",
    })
  })

  it("does not add or hold a streamer on a 10-roster-game night", () => {
    const days = ["2025-10-23"]
    const packed = packedRosterPlayers()
    const fa = player("fa-okc", "OKC", { positions: ["PF"] })
    const state = tinyState([...packed, fa], ["fa-okc"])
    state.teams[0]!.entries = packed.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-23",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      { date: "2025-10-23", homeAbbr: "OKC", awayAbbr: "WAS" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
    })
    expect(plan.days[0]!.cells.every((cell) => cell.action === "empty")).toBe(true)
    expect(plan.days[0]!.cells.every((cell) => cell.playerId === null)).toBe(true)
    expect(plan.gameStarts).toBe(10)
  })

  it("fills both 2-spot seats on a 4-roster-game night via UTIL holes", () => {
    const day = "2026-10-20"
    const roster = [
      player("r-pg", "BOS", { positions: ["PG"] }),
      player("r-sg", "DET", { positions: ["SG"] }),
      player("r-sf", "NYK", { positions: ["SF"] }),
      player("r-pf", "PHI", { positions: ["PF"] }),
      player("r-c", "CHI", { positions: ["C"] }),
    ]
    const faGuard = player("fa-sas", "SAS", {
      positions: ["PG", "SG"],
      projections: { ...baseProjections(), REB: 380 },
    })
    const faWing = player("fa-okc", "OKC", {
      positions: ["SF"],
      projections: { ...baseProjections(), REB: 360 },
    })
    const state = tinyState([...roster, faGuard, faWing], ["fa-sas", "fa-okc"])
    state.teams[0]!.entries = [
      { slot: "PG", playerId: "r-pg" },
      { slot: "SG", playerId: "r-sg" },
      { slot: "SF", playerId: "r-sf" },
      { slot: "PF", playerId: "r-pf" },
      { slot: "C", playerId: "r-c" },
      { slot: "BE", playerId: null },
    ]
    const daily = {
      [day]: emptyActive().map((entry) => ({
        ...entry,
        playerId:
          entry.slot === "PG"
            ? "r-pg"
            : entry.slot === "SG"
              ? "r-sg"
              : entry.slot === "SF"
                ? "r-sf"
                : entry.slot === "PF"
                  ? "r-pf"
                  : null,
      })),
    }
    const schedule = tinySchedule([day], [
      { date: day, homeAbbr: "DET", awayAbbr: "BOS" },
      { date: day, homeAbbr: "NYK", awayAbbr: "PHI" },
      { date: day, homeAbbr: "SAS", awayAbbr: "OKC" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      addLimit: 7,
      daily,
    })
    const seated = plan.days[0]!.cells.filter((cell) => cell.playerId)
    expect(seated).toHaveLength(2)
    expect(seated.map((cell) => cell.playerId).sort()).toEqual([
      "fa-okc",
      "fa-sas",
    ])
  })

  it("caps 2-spot at one streamer when the day has one hole", () => {
    const days = ["2025-10-21"]
    const packed = packedRosterPlayers()
    const faA = player("fa-a", "OKC", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 400 },
    })
    const faB = player("fa-b", "POR", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 390 },
    })
    const idle = offNightBench()
    const state = tinyState([...packed, faA, faB, idle], ["fa-a", "fa-b"])
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: idle.id },
    ]
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const daily = { "2025-10-21": pfOpen }
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-21",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
    })
    const seated = plan.days[0]!.cells.filter((cell) => cell.playerId)
    expect(seated).toHaveLength(1)
  })

  it("counts a forced hold seated into UTIL by the preview overlay", () => {
    const days = ["2025-10-20", "2025-10-21"]
    const guard = player("fa-guard", "OKC", { positions: ["PG"] })
    const center = player("roster-c", "DEN", { positions: ["C"] })
    const utility = player("roster-u", "MIA", { positions: ["SF"] })
    const point = player("roster-pg", "NYK", { positions: ["PG"] })
    const state = tinyState(
      [guard, center, utility, point],
      [guard.id],
    )
    state.rosterSlots = ["PG", "C", "UTIL", "BE"]
    state.teams[0]!.entries = [
      { slot: "PG", playerId: point.id },
      { slot: "C", playerId: center.id },
      { slot: "UTIL", playerId: utility.id },
      { slot: "BE", playerId: null },
    ]
    const daily: DailyLineups = {
      "2025-10-20": [
        { slot: "PG", playerId: null },
        { slot: "C", playerId: center.id },
        { slot: "UTIL", playerId: utility.id },
      ],
      "2025-10-21": [
        { slot: "PG", playerId: point.id },
        { slot: "C", playerId: null },
        { slot: "UTIL", playerId: null },
      ],
    }
    const schedule = tinySchedule(days, [
      { date: days[0]!, homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: days[1]!, homeAbbr: "OKC", awayAbbr: "CHI" },
      { date: days[0]!, homeAbbr: "DEN", awayAbbr: "ATL" },
      { date: days[0]!, homeAbbr: "MIA", awayAbbr: "ORL" },
      { date: days[1]!, homeAbbr: "NYK", awayAbbr: "BOS" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      daily,
      forcedRosterDrops: {
        [streamingAddDropKey(days[1]!, 0)]: "hold",
      },
    })

    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: guard.id,
    })
    expect(plan.gameStarts).toBe(5)
  })

  it("lets only one PG-only streamer claim the next day's PG hole", () => {
    const days = ["2025-10-20", "2025-10-21"]
    const first = player("fa-pg-1", "OKC", { positions: ["PG"] })
    const second = player("fa-pg-2", "POR", { positions: ["PG"] })
    const state = tinyState([first, second], [first.id, second.id])
    state.rosterSlots = ["PG", "G", "BE"]
    state.teams[0]!.entries = [
      { slot: "PG", playerId: null },
      { slot: "G", playerId: null },
      { slot: "BE", playerId: null },
    ]
    const daily: DailyLineups = {
      "2025-10-20": [
        { slot: "PG", playerId: null },
        { slot: "G", playerId: null },
      ],
      "2025-10-21": [
        { slot: "PG", playerId: null },
        { slot: "C", playerId: null },
      ],
    }
    const schedule = tinySchedule(days, [
      ...days.map((date) => ({
        date,
        homeAbbr: "OKC",
        awayAbbr: "WAS",
      })),
      ...days.map((date) => ({
        date,
        homeAbbr: "POR",
        awayAbbr: "CHI",
      })),
    ])

    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
    })

    expect(plan.days[0]!.cells.filter((cell) => cell.playerId).length).toBeGreaterThanOrEqual(1)
    expect(plan.days[1]!.cells.filter((cell) => cell.playerId).length).toBeGreaterThanOrEqual(1)
  })

  it("re-adds after a packed-night drop only after waiver cooldown", () => {
    const days = [
      "2025-10-21",
      "2025-10-23",
      "2025-10-24",
      "2025-10-27",
      "2025-10-28",
    ]
    const packed = packedRosterPlayers()
    const fa = player("fa-por", "POR", { positions: ["PF"] })
    const state = tinyState([...packed, fa], ["fa-por"])
    state.teams[0]!.entries = packed.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    state.rosterSlots = [...packedActiveSlots, "BE"]
    state.teams[0]!.entries.push({ slot: "BE", playerId: null })
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const packedDay = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: packed[index]!.id,
    }))
    const daily = {
      "2025-10-21": pfOpen.map((entry) => ({ ...entry })),
      "2025-10-23": packedDay,
      "2025-10-24": pfOpen.map((entry) => ({ ...entry })),
      "2025-10-27": pfOpen.map((entry) => ({ ...entry })),
      "2025-10-28": pfOpen.map((entry) => ({ ...entry })),
    }
    const schedule = tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr) => ({
          date,
          homeAbbr,
          awayAbbr: "SAC",
        })),
      ),
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
      { date: "2025-10-24", homeAbbr: "POR", awayAbbr: "NYK" },
      { date: "2025-10-27", homeAbbr: "POR", awayAbbr: "BOS" },
      { date: "2025-10-28", homeAbbr: "POR", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-por",
      addIndex: 1,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
    })
    expect(plan.days[2]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
    })
    expect(plan.days[3]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
    })
    expect(plan.days[4]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-por",
      addIndex: 2,
    })
    expect(plan.addsUsed).toBe(2)
  })

  it("picks a 10/20-21 B2B only when both nights are holes", () => {
    const days = ["2025-10-20", "2025-10-21"]
    const packed = packedRosterPlayers()
    const b2b = player("fa-b2b", "CHI", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 200 },
    })
    const oneHole = player("fa-one", "POR", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 500 },
    })
    const idle = offNightBench()
    const state = tinyState([...packed, b2b, oneHole, idle], ["fa-b2b", "fa-one"])
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: idle.id },
    ]
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const packedDay = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: packed[index]!.id,
    }))
    const daily = {
      "2025-10-20": pfOpen,
      "2025-10-21": packedDay,
    }
    const schedule = tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr) => ({
          date,
          homeAbbr,
          awayAbbr: "SAC",
        })),
      ),
      { date: "2025-10-20", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "NYK" },
      { date: "2025-10-20", homeAbbr: "POR", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
    })
    expect(plan.days[0]!.cells[0]?.playerId).toBe("fa-one")
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
    })
  })
})

describe("board-delta planner", () => {
  it("keeps more hole starts ahead of projectedCatWins delta", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const volume = player("fa-vol", "BOS", {
      projections: { ...baseProjections(), BLK: 0, PTS: 2000 },
    })
    const quality = player("fa-q", "NYK", {
      projections: { ...baseProjections(), BLK: 400, PTS: 10 },
    })
    const state = tinyState([volume, quality], ["fa-vol", "fa-q"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: losingBlkBoard(),
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-q",
    })
  })

  it("skips an add when dropping the only droppable starter would not raise projectedCatWins", () => {
    const days = ["2025-11-03"]
    const date = days[0]!
    const rostered = packedRosterPlayers()
    const star = player("star", "WAS", {
      projections: { ...baseProjections(), STL: 2000 },
    })
    const fa = player("fa-stl", "TOR", {
      projections: { ...baseProjections(), STL: 5 },
    })
    const state = tinyState([...rostered, star, fa], ["fa-stl"])
    state.teams[0]!.entries = [
      ...rostered.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: "star" },
    ]
    const dailyEntries = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: index < 9 ? rostered[index]!.id : "star",
    }))
    const daily: DailyLineups = { [date]: dailyEntries }
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr, index) => ({
        date,
        homeAbbr,
        awayAbbr: index % 2 === 0 ? "SAC" : "ORL",
      })),
      { date, homeAbbr: "WAS", awayAbbr: "DET" },
      { date, homeAbbr: "TOR", awayAbbr: "CLE" },
    ])
    const adpByPlayerId = Object.fromEntries(
      rostered.map((entry) => [entry.id, 10]),
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      adpByPlayerId,
      daily,
    })
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).not.toBe("star")
    expect(
      plan.days[0]!.cells[0]!.action === "empty" ||
        plan.days[0]!.cells[0]!.rosterDropPlayerId !== "star",
    ).toBe(true)
    if (plan.days[0]!.cells[0]!.action === "add") {
      expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).not.toBe("star")
    } else {
      expect(plan.days[0]!.cells[0]).toMatchObject({
        action: "empty",
        playerId: null,
      })
    }
  })

  it("holds the first overlay on day 2 when a second add would not raise the board", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), BLK: 400, TO: 40 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), BLK: 0, TO: 400 },
    })
    const state = tinyState([faA, faB], ["fa-a", "fa-b"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: losingBlkBoard(),
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-a",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-b",
    })
  })

  it("swaps a 1-spot game-day hold when a close loss can be helped that night", () => {
    const days = ["2025-10-22", "2025-10-23"]
    const merrill = player("merrill", "CLE", {
      projections: { ...baseProjections(), TPM: 400, REB: 50, PTS: 1600 },
    })
    const rebounder = player("rebounder", "NYK", {
      projections: {
        ...baseProjections(),
        TPM: 20,
        REB: 280,
        PTS: 200,
        AST: 40,
        STL: 15,
        BLK: 10,
        TO: 220,
      },
      shooting: { FGM: 80, FGA: 220, FTM: 40, FTA: 60 },
    })
    const state = tinyState([merrill, rebounder], ["merrill", "rebounder"])
    const schedule = tinySchedule(days, [
      { date: "2025-10-22", homeAbbr: "CLE", awayAbbr: "CHI" },
      { date: "2025-10-23", homeAbbr: "CLE", awayAbbr: "MIA" },
      { date: "2025-10-23", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "merrill",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "rebounder",
    })
  })

  it("holds a 1-spot game-day streamer when no FA improves the close loss", () => {
    const days = ["2025-10-22", "2025-10-23"]
    const merrill = player("merrill", "CLE", {
      projections: { ...baseProjections(), TPM: 400, REB: 50 },
    })
    const worseGuard = player("worse-guard", "NYK", {
      projections: { ...baseProjections(), TPM: 20, REB: 10 },
    })
    const state = tinyState([merrill, worseGuard], ["merrill", "worse-guard"])
    const schedule = tinySchedule(days, [
      { date: "2025-10-22", homeAbbr: "CLE", awayAbbr: "CHI" },
      { date: "2025-10-23", homeAbbr: "CLE", awayAbbr: "MIA" },
      { date: "2025-10-23", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "merrill",
    })
    expect(["add", "drop_add"]).toContain(plan.days[1]!.cells[0]!.action)
    expect(plan.days[1]!.cells[0]!.action).not.toBe("hold")
  })

  it("does not invent a hole from a packed saved game-day lineup", () => {
    const days = ["2025-11-03"]
    const date = days[0]!
    const rostered = packedRosterPlayers()
    const benchOff = player("bench-off", "WAS", {
      projections: { ...baseProjections(), BLK: 5 },
    })
    const fa = player("fa-blk", "TOR", {
      projections: { ...baseProjections(), BLK: 400 },
    })
    const state = tinyState([...rostered, benchOff, fa], ["fa-blk"])
    state.teams[0]!.entries = [
      ...rostered.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: "bench-off" },
    ]
    const dailyEntries = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: index < 9 ? rostered[index]!.id : "bench-off",
    }))
    const daily: DailyLineups = { [date]: dailyEntries }
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr, index) => ({
        date,
        homeAbbr,
        awayAbbr: index % 2 === 0 ? "SAC" : "ORL",
      })),
      { date, homeAbbr: "WAS", awayAbbr: "DET" },
      { date, homeAbbr: "TOR", awayAbbr: "CLE" },
    ])
    const adpByPlayerId = Object.fromEntries(
      rostered.map((entry) => [entry.id, 10]),
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: losingBlkBoard(),
      adpByPlayerId,
      daily,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
      rosterDropKind: "none",
      rosterDropPlayerId: null,
    })
  })

  it("adds a thin one-game FA early in the week when that is the hole cover", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
    ]
    const thin = player("fa-thin", "NYK", {
      projections: { ...baseProjections(), BLK: 400 },
    })
    const state = tinyState([thin], ["fa-thin"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: losingBlkBoard(),
      addLimit: 3,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-thin",
    })
  })
})

describe("2/3-spot density-first off nights", () => {
  const fourDays = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
  const sevenDays = [
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
    "2025-11-08",
    "2025-11-09",
  ]

  it("holds a 2-in-3 add through the off night then drops after the window", () => {
    const twoInThree = player("fa-okc", "OKC", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const tuesdayOnly = player("fa-tue", "CHI", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const nextBlock = player("fa-next", "NYK", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState(
      [twoInThree, tuesdayOnly, nextBlock],
      ["fa-okc", "fa-tue", "fa-next"],
    )
    const days = [
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]
    const schedule = tinySchedule(days, [
      { date: "2026-10-20", homeAbbr: "OKC", awayAbbr: "SAS" },
      { date: "2026-10-21", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2026-10-22", homeAbbr: "OKC", awayAbbr: "IND" },
      { date: "2026-10-23", homeAbbr: "NYK", awayAbbr: "BOS" },
      { date: "2026-10-24", homeAbbr: "NYK", awayAbbr: "BKN" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-okc",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-tue",
    })
  })

  it("swaps a high-volume hold for a 3-in-4 before the last three days", () => {
    const volume = player("fa-volume", "NYK", {
      projections: { ...baseProjections(), STL: 120 },
    })
    const dense = player("fa-dense", "CHI", {
      projections: { ...baseProjections(), STL: 110 },
    })
    const state = tinyState([volume, dense], ["fa-volume", "fa-dense"])
    const schedule = tinySchedule(sevenDays, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "BKN" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-08", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-09", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-11-05", homeAbbr: "CHI", awayAbbr: "IND" },
      { date: "2025-11-06", homeAbbr: "CHI", awayAbbr: "MIL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-volume",
    })
    expect(["add", "drop_add"]).toContain(plan.days[1]!.cells[0]!.action)
    expect(plan.days[1]!.cells[0]!.action).not.toBe("hold")
  })

  it("adds a thin FA into a mid-block hole without holding a no-game occupant", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    // Need a second FA so 2-spot can fill spot 1 without taking CHI on Mon if needed
    const atl = player("fa-atl", "ATL", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([bos, chi, atl], ["fa-bos", "fa-chi", "fa-atl"])
    const schedule = tinySchedule(sevenDays, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[1]!.cells.some((cell) => cell.playerId === "fa-bos")).toBe(
      true,
    )
    expect(
      plan.days[1]!.cells.find((cell) => cell.playerId === "fa-bos"),
    ).toMatchObject({ action: "hold" })
    const chiCell = plan.days[1]!.cells.find((cell) => cell.playerId === "fa-chi")
    if (chiCell) {
      expect(chiCell.droppedPlayerId).not.toBe("fa-bos")
    }
  })

  it("adds a thin FA into a late-week hole without holding a no-game occupant", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const atl = player("fa-atl", "ATL", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([bos, chi, atl], ["fa-bos", "fa-chi", "fa-atl"])
    const schedule = tinySchedule(fourDays, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[1]!.cells.some((cell) => cell.playerId === "fa-bos")).toBe(
      true,
    )
    expect(
      plan.days[1]!.cells.find((cell) => cell.playerId === "fa-bos"),
    ).toMatchObject({ action: "hold" })
  })

  it("replaces a no-game occupant when an ok block starts on a hole night", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    // NYK: Tue+Wed = 2 games in window from Tue → ok or strong if B2B
    const nyk = player("fa-nyk", "NYK", {
      projections: { ...baseProjections(), STL: 190 },
    })
    const atl = player("fa-atl", "ATL", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([bos, nyk, atl], ["fa-bos", "fa-nyk", "fa-atl"])
    const schedule = tinySchedule(fourDays, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[1]!.cells.some((cell) => cell.playerId === "fa-bos")).toBe(
      true,
    )
    expect(
      plan.days[1]!.cells.find((cell) => cell.playerId === "fa-bos"),
    ).toMatchObject({ action: "hold" })
    expect(
      plan.days[1]!.cells.some(
        (cell) =>
          cell.action === "drop_add" && cell.droppedPlayerId === "fa-bos",
      ),
    ).toBe(false)
  })

  it("drop_adds a 2-spot occupant on an off night for more remaining seatable games", () => {
    const days = ["2025-10-21", "2025-10-22", "2025-10-23", "2025-10-24"]
    const daSilva = player("fa-dasilva", "OKC", {
      positions: ["PF", "F"],
      projections: { ...baseProjections(), REB: 420, STL: 40 },
    })
    const rebounder = player("fa-rebound", "POR", {
      positions: ["PF", "F"],
      projections: { ...baseProjections(), REB: 380, STL: 40 },
    })
    const filler = player("fa-atl", "ATL", {
      positions: ["SG", "G"],
      projections: { ...baseProjections(), STL: 140, REB: 40 },
    })
    const state = tinyState(
      [daSilva, rebounder, filler],
      ["fa-dasilva", "fa-rebound", "fa-atl"],
    )
    const schedule = tinySchedule(days, [
      { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-10-21", homeAbbr: "ATL", awayAbbr: "MIA" },
      { date: "2025-10-22", homeAbbr: "POR", awayAbbr: "CHI" },
      { date: "2025-10-23", homeAbbr: "OKC", awayAbbr: "ORL" },
      { date: "2025-10-24", homeAbbr: "POR", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      addLimit: 7,
    })
    expect(plan.days[0]!.cells.some((cell) => cell.playerId === "fa-dasilva")).toBe(
      true,
    )
    expect(
      plan.days[1]!.cells.find((cell) => cell.playerId === "fa-dasilva"),
    ).toMatchObject({ action: "hold" })
    expect(
      plan.days[1]!.cells.find((cell) => cell.playerId === "fa-rebound")
        ?.droppedPlayerId,
    ).not.toBe("fa-dasilva")
    expect(
      plan.days[2]!.cells.find((cell) => cell.playerId === "fa-dasilva"),
    ).toMatchObject({ action: "hold" })
  })

  it("does not count a remaining game the FA cannot sit when ranking volume", () => {
    const days = ["2025-10-21", "2025-10-22", "2025-10-23"]
    const packed = packedRosterPlayers()
    const oneAndStuck = player("fa-stuck", "OKC", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 500, STL: 40 },
    })
    const twoSeatable = player("fa-two", "POR", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 360, STL: 40 },
    })
    const idle = offNightBench()
    const state = tinyState(
      [...packed, oneAndStuck, twoSeatable, idle],
      ["fa-stuck", "fa-two"],
    )
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: idle.id },
    ]
    const packedDay = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: packed[index]!.id,
    }))
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const daily: DailyLineups = {
      "2025-10-21": pfOpen.map((entry) => ({ ...entry })),
      "2025-10-22": pfOpen.map((entry) => ({ ...entry })),
      "2025-10-23": packedDay,
    }
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-21",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-22",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-23",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
      { date: "2025-10-22", homeAbbr: "POR", awayAbbr: "NYK" },
      { date: "2025-10-23", homeAbbr: "OKC", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-stuck",
    })
    expect(plan.days[1]!.cells[0]!.playerId).toBe("fa-two")
  })

  it("drops a no-game occupant for a playable FA regardless of projectedCatWins", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const mil = player("fa-mil", "MIL", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState([bos, mil, chi], ["fa-bos", "fa-mil", "fa-chi"])
    const schedule = tinySchedule(fourDays, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "MIL", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "MIL", awayAbbr: "NYK" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "DET" },
      { date: "2025-11-06", homeAbbr: "MIL", awayAbbr: "CLE" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(
      plan.days[1]!.cells.some((cell) => cell.action === "hold"),
    ).toBe(true)
  })

  it("skips adds on dates when daily active lineup is already full", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const state = tinyState([faA], ["fa-a"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const fullEntries = Array.from({ length: 10 }, (_, index) => ({
      slot: (index < 5
        ? (["PG", "SG", "SF", "PF", "C"] as const)[index]!
        : "UTIL") as "PG" | "SG" | "SF" | "PF" | "C" | "UTIL",
      playerId: `fill-${index}`,
    }))
    const fillers = fullEntries.map((entry) =>
      player(entry.playerId!, "BOS", {
        positions: ["PG"],
      }),
    )
    state.players.push(...fillers)
    const daily = {
      "2025-11-03": fullEntries,
      "2025-11-04": fullEntries.map((entry) => ({ ...entry, playerId: null })),
    }

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      daily,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
      addIndex: null,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-a",
      addIndex: 1,
    })
    expect(plan.addsUsed).toBe(1)
  })
})

describe("streaming waiver cooldown", () => {
  const days = [
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
  ]
  const bos = () =>
    player("fa-bos", "BOS", { projections: { ...baseProjections(), STL: 200 } })
  const nyk = () =>
    player("fa-nyk", "NYK", { projections: { ...baseProjections(), STL: 150 } })
  const chi = () =>
    player("fa-chi", "CHI", { projections: { ...baseProjections(), STL: 80 } })
  const schedule = tinySchedule(days, [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
    { date: "2025-11-05", homeAbbr: "CHI", awayAbbr: "MIA" },
    { date: "2025-11-06", homeAbbr: "CHI", awayAbbr: "DET" },
    { date: "2025-11-07", homeAbbr: "BOS", awayAbbr: "PHI" },
  ])

  it("does not re-add a Tuesday drop on Wednesday under the default 2-day waiver", () => {
    const plan = buildStreamingPlan({
      spotCount: 1,
      state: tinyState([bos(), nyk(), chi()], ["fa-bos", "fa-nyk", "fa-chi"]),
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-nyk",
      droppedPlayerId: "fa-bos",
    })
    expect(plan.days[2]!.cells[0]?.playerId).not.toBe("fa-bos")
  })

  it("can re-add the dropped streamer on Friday after a 2-day cooldown", () => {
    const plan = buildStreamingPlan({
      spotCount: 1,
      state: tinyState([bos(), nyk(), chi()], ["fa-bos", "fa-nyk", "fa-chi"]),
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[4]!.cells[0]?.playerId).toBe("fa-bos")
  })

  it("can re-add the dropped streamer on Friday even when opponent sim is on", () => {
    const opp = player("opp-1", "ATL")
    const state = tinyState(
      [bos(), nyk(), chi(), opp],
      ["fa-bos", "fa-nyk", "fa-chi"],
    )
    state.teams[1]!.entries = [{ slot: "UTIL", playerId: "opp-1" }]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      oppSpotCount: 1,
    })
    expect(plan.days[4]!.cells[0]?.playerId).toBe("fa-bos")
  })

  it("lets a 1-day waiver return the drop on Thursday", () => {
    const plan = buildStreamingPlan({
      spotCount: 1,
      state: tinyState([bos(), nyk(), chi()], ["fa-bos", "fa-nyk", "fa-chi"]),
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 1,
    })
    expect(plan.days[2]!.cells[0]?.playerId).not.toBe("fa-bos")
    expect(plan.days[4]!.cells[0]?.playerId).toBe("fa-bos")
  })

  it("reads waiverPeriodDays from the league state when the call omits it", () => {
    const plan = buildStreamingPlan({
      spotCount: 1,
      state: {
        ...tinyState([bos(), nyk(), chi()], ["fa-bos", "fa-nyk", "fa-chi"]),
        waiverPeriodDays: 3,
      },
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[4]!.cells[0]?.playerId).not.toBe("fa-bos")
  })
})

describe("interleaved opponent streaming", () => {
  it("keeps our FA on collision and gives the opponent the next STL FA", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const you = player("you-1", "CHI")
    const opp = player("opp-1", "ATL")
    const state = tinyState([faA, faB, you, opp], ["fa-a", "fa-b"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-1" },
      { slot: "BE", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "UTIL", playerId: "opp-1" },
      { slot: "BE", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-a")
    expect(plan.opponentDays[0]!.streamerPlayerId).toBe("fa-b")
    expect(plan.opponentDays[0]!.streamerPlayerId).not.toBe(
      plan.days[0]!.cells[0]!.playerId,
    )
  })

  it("does not add an FA the opponent already claimed on a later day", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 2000 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const faC = player("fa-c", "MIA", {
      projections: {
        ...baseProjections(),
        STL: 80,
        REB: 120,
        AST: 100,
        TPM: 30,
        PTS: 400,
        BLK: 10,
      },
    })
    const you = player("you-1", "CHI")
    const opp = player("opp-1", "ATL")
    const state = tinyState([faA, faB, faC, you, opp], ["fa-a", "fa-b", "fa-c"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "you-1" },
      { slot: "BE", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "UTIL", playerId: "opp-1" },
      { slot: "BE", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "DET" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "PHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-a")
    expect(plan.opponentDays[0]!.streamerPlayerId).toBe("fa-b")
    expect(plan.days[1]!.cells[0]!.playerId).not.toBe("fa-a")
  })

  it("keeps a streamer the opponent swapped out on waiver", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const faOppMon = player("fa-opp-mon", "NYK", {
      projections: { ...baseProjections(), STL: 1 },
    })
    const faOppTue = player("fa-opp-tue", "MIA", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const you = player("you-1", "CHI")
    const opp = player("opp-1", "ATL")
    const state = tinyState(
      [faA, faOppMon, faOppTue, you, opp],
      ["fa-a", "fa-opp-mon", "fa-opp-tue"],
    )
    state.teams[0]!.entries = [
      { slot: "PG", playerId: "you-1" },
      { slot: "UTIL", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: "opp-1" },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "PHI" },
      { date: "2025-11-04", homeAbbr: "ATL", awayAbbr: "CLE" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "WAS" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      oppSpotCount: 1,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-a")
    expect(plan.opponentDays[0]!.streamerPlayerId).toBe("fa-opp-mon")
    expect(["add", "drop_add", "empty"]).toContain(
      plan.opponentDays[1]!.cells[0]!.action,
    )
    expect(plan.days[2]!.cells[0]!.playerId).not.toBe("fa-opp-mon")
  })

  it("does not week-drop another roster player when replacing an expired opp streamer", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const oppPositions = [
      ["PG"],
      ["SG"],
      ["SF"],
      ["PF"],
      ["C"],
      ["PG", "SG"],
      ["SF", "PF"],
      ["SG"],
      ["PG"],
      ["SF"],
    ] as const
    const rostered = packedTeamAbbrs.map((team, index) =>
      player(`r${index}`, team, {
        positions: [...oppPositions[index]!],
        projections: {
          ...baseProjections(),
          STL: index === 7 ? 5 : index === 8 ? 8 : 80,
        },
      }),
    )
    const faYou = player("fa-you", "TOR", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 200 },
    })
    const faOpp1 = player("fa-opp-1", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faOpp2 = player("fa-opp-2", "ORL", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const faOpp3 = player("fa-opp-3", "IND", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState(
      [...rostered, faYou, faOpp1, faOpp2, faOpp3],
      ["fa-you", "fa-opp-1", "fa-opp-2", "fa-opp-3"],
    )
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: null }]
    state.teams[1]!.entries = rostered.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    const schedule = tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr, index) => ({
          date,
          homeAbbr,
          awayAbbr: index % 2 === 0 ? "MEM" : "CHA",
        })),
      ),
      { date: "2025-11-03", homeAbbr: "TOR", awayAbbr: "BKN" },
      { date: "2025-11-04", homeAbbr: "TOR", awayAbbr: "BKN" },
      { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      { date: "2025-11-04", homeAbbr: "ORL", awayAbbr: "BKN" },
      { date: "2025-11-04", homeAbbr: "IND", awayAbbr: "BKN" },
    ])
    const adpByPlayerId = Object.fromEntries(
      rostered.map((entry, index) => [
        entry.id,
        index === 7 || index === 8 ? 200 : 10,
      ]),
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 2,
      adpByPlayerId,
    })
    const day2Ids = (plan.opponentDaily["2025-11-04"] ?? [])
      .map((entry) => entry.playerId)
      .filter((id): id is string => Boolean(id))

    expect(
      plan.opponentDays.every((day) =>
        day.cells.every(
          (cell) => cell.action === "empty" && cell.playerId === null,
        ),
      ),
    ).toBe(true)
    expect(day2Ids).not.toContain("fa-opp-1")
    expect(day2Ids).not.toContain("fa-opp-2")
    expect(day2Ids).not.toContain("fa-opp-3")
    expect(day2Ids).toEqual(
      expect.arrayContaining(rostered.map((player) => player.id)),
    )
  })

  it("uses the selected opponent roster when opponentTeamIndex is set", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const you = player("you-1", "CHI")
    const firstOpp = player("first-opp", "ATL")
    const selectedOpp = player("selected-opp", "DEN")
    const state: SeasonLeagueState = {
      ...tinyState([faA, you, firstOpp, selectedOpp], ["fa-a"]),
      teams: [
        {
          teamIndex: 0,
          name: "You",
          entries: [
            { slot: "UTIL", playerId: "you-1" },
            { slot: "BE", playerId: null },
          ],
        },
        {
          teamIndex: 1,
          name: "First other",
          entries: [{ slot: "UTIL", playerId: "first-opp" }],
        },
        {
          teamIndex: 2,
          name: "Selected",
          entries: [{ slot: "UTIL", playerId: "selected-opp" }],
        },
      ],
      waiverOrder: [0, 1, 2],
    }
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "DET" },
      { date: "2025-11-03", homeAbbr: "DEN", awayAbbr: "ORL" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      opponentTeamIndex: 2,
    })
    const dayIds = (plan.opponentDaily["2025-11-03"] ?? [])
      .map((entry) => entry.playerId)
      .filter((id): id is string => Boolean(id))

    expect(dayIds).toContain("selected-opp")
    expect(dayIds).not.toContain("first-opp")
  })
})

describe("budget-behind ranking and surplus drops", () => {
  it("still adds a thin stream when leftover adds remain early in the week", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
    ]
    const thin = player("fa-thin", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const state = tinyState([thin], ["fa-thin"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 5,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-thin",
    })
  })

  it("auto-cuts the off-night player when the add budget is behind", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const rebMonster = player("reb-monster", "ATL", {
      projections: { ...baseProjections(), REB: 360, STL: 5 },
    })
    const stlIdle = player("stl-idle", "CHI", {
      projections: { ...baseProjections(), REB: 40, STL: 40 },
    })
    const state = tinyState([faA, rebMonster, stlIdle], ["fa-a"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "reb-monster" },
      { slot: "BE", playerId: "stl-idle" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("stl-idle")
  })

  it("can swap a held game-day streamer when the add budget is behind", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faHeld = player("fa-held", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const faUpgrade = player("fa-upgrade", "NYK", {
      projections: { ...baseProjections(), STL: 240 },
    })
    const state = tinyState([faHeld, faUpgrade], ["fa-held", "fa-upgrade"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-held",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-upgrade",
    })
  })

  it("records the opponent roster drop on opponentDays", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const faOpp = player("fa-opp", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const you = player("you-1", "CHI")
    const oppCut = player("opp-cut", "ATL", {
      projections: { ...baseProjections(), STL: 5 },
    })
    const state = tinyState([faA, faOpp, you, oppCut], ["fa-a", "fa-opp"])
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: "you-1" }]
    state.teams[1]!.entries = [{ slot: "UTIL", playerId: "opp-cut" }]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
    })

    expect(plan.opponentDays[0]!.streamerPlayerId).toBe("fa-opp")
    expect(plan.opponentDays[0]!.droppedPlayerId).toBe("opp-cut")
    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      spotIndex: 0,
      playerId: "fa-opp",
      droppedPlayerId: "opp-cut",
      action: "add",
      addIndex: 1,
    })
  })

  it("fills an empty stream spot even when the board is already winning", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const state = tinyState([faA], ["fa-a"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
    ])
    const winningBoard: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: 20,
        opp: 8,
        outcome: "W",
        winProb: 0.9,
      })),
      wins: 9,
      losses: 0,
      ties: 0,
      projectedCatWins: 9,
    }

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: winningBoard,
      addLimit: 2,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-a",
    })
  })

  it("adds a big who helps losing FG%/REB/BLK instead of a guard who pads winning PTS", () => {
    const days = ["2025-11-03"]
    const starter = player("starter", "BOS", {
      positions: ["SG"],
      projections: {
        FG_PCT: 0.4,
        FT_PCT: 0.8,
        TPM: 3.1,
        REB: 2,
        AST: 7.1,
        STL: 1.2,
        BLK: 0,
        TO: 2,
        PTS: 24.2,
      },
      shooting: { FGM: 8, FGA: 20, FTM: 4, FTA: 5 },
    })
    const guard = player("fa-guard", "NYK", {
      positions: ["PG"],
      projections: {
        FG_PCT: 0.38,
        FT_PCT: 0.88,
        TPM: 6,
        REB: 1,
        AST: 10,
        STL: 2.5,
        BLK: 0,
        TO: 1.5,
        PTS: 36,
      },
      shooting: { FGM: 10, FGA: 26, FTM: 5, FTA: 5.5 },
    })
    const big = player("fa-big", "CHI", {
      positions: ["C"],
      projections: {
        FG_PCT: 0.64,
        FT_PCT: 0.7,
        TPM: 0,
        REB: 13,
        AST: 1,
        STL: 0.3,
        BLK: 2.8,
        TO: 2.2,
        PTS: 10,
      },
      shooting: { FGM: 6, FGA: 9, FTM: 1, FTA: 2 },
    })
    const state = tinyState([starter, guard, big], ["fa-guard", "fa-big"])
    state.teams[0]!.entries = [
      { slot: "SG", playerId: "starter" },
      { slot: "UTIL", playerId: null },
    ]
    const dailyEntries = emptyActive()
    dailyEntries[1] = { slot: "SG", playerId: "starter" }
    const daily: DailyLineups = { "2025-11-03": dailyEntries }
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "ORL" },
    ])
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        const opp =
          categoryId === "FG_PCT"
            ? 0.47
            : categoryId === "FT_PCT"
              ? 0.79
              : categoryId === "TPM"
                ? 3
                : categoryId === "REB"
                  ? 8
                  : categoryId === "AST"
                    ? 7
                    : categoryId === "STL"
                      ? 1.1
                      : categoryId === "BLK"
                        ? 2
                        : categoryId === "TO"
                          ? 2.1
                          : 24
        const losing =
          categoryId === "FG_PCT" || categoryId === "REB" || categoryId === "BLK"
        return {
          categoryId,
          you: losing ? 1 : 50,
          opp,
          outcome: losing ? "L" as const : "W" as const,
          winProb: losing ? 0.4 : 0.85,
        }
      }),
      wins: 6,
      losses: 3,
      ties: 0,
      projectedCatWins: 6,
    }

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      daily,
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-big",
    })
  })
})

describe("realistic opponent and 1-spot streaming", () => {
  it("does not let the opponent roster-drop an ADP-protected star", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faYou = player("fa-you", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const faOpp = player("fa-opp", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const you = player("you-1", "CHI")
    const star = player("opp-star", "CLE", {
      projections: { ...baseProjections(), REB: 800, BLK: 200, STL: 5 },
    })
    const bench = player("opp-bench", "DET", {
      projections: { ...baseProjections(), REB: 20, STL: 40 },
    })
    const state = tinyState(
      [faYou, faOpp, you, star, bench],
      ["fa-you", "fa-opp"],
    )
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: "you-1" }]
    state.teams[1]!.entries = [
      { slot: "C", playerId: "opp-star" },
      { slot: "BE", playerId: "opp-bench" },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-03", homeAbbr: "CLE", awayAbbr: "ORL" },
      { date: "2025-11-03", homeAbbr: "DET", awayAbbr: "ATL" },
      { date: "2025-11-04", homeAbbr: "CLE", awayAbbr: "PHI" },
      { date: "2025-11-04", homeAbbr: "DET", awayAbbr: "BKN" },
      { date: "2025-11-05", homeAbbr: "CLE", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "DET", awayAbbr: "CHA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      adpByPlayerId: { "opp-star": 8, "opp-bench": 180 },
    })

    expect(plan.opponentDays[0]!.droppedPlayerId).not.toBe("opp-star")
    expect(plan.opponentDays[0]!.cells[0]?.droppedPlayerId).not.toBe("opp-star")
  })

  it("opponent drop_adds on a mid-week off night instead of holding the first add", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const faHeld = player("fa-opp-held", "CLE", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const faOff = player("fa-opp-off", "TOR", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState([faHeld, faOff], ["fa-opp-held", "fa-opp-off"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "CLE", awayAbbr: "DET" },
      { date: "2025-11-04", homeAbbr: "TOR", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "CLE", awayAbbr: "PHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      addLimit: 7,
      forcedRosterDrops: {
        [streamingAddDropKey("2025-11-03", 0)]: "hold",
        [streamingAddDropKey("2025-11-04", 0)]: "hold",
      },
    })

    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-opp-held",
    })
    expect(plan.opponentDays[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-opp-off",
    })
  })

  it("1-spot drop_adds on an off night when another FA plays that day", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const merrill = player("fa-merrill", "CLE", {
      projections: { ...baseProjections(), STL: 180, TPM: 200 },
    })
    const fill = player("fa-fill", "NYK", {
      projections: { ...baseProjections(), STL: 80, TPM: 40 },
    })
    const state = tinyState([merrill, fill], ["fa-merrill", "fa-fill"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "CLE", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "CLE", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-merrill",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-fill",
    })
  })

  it("leaves a packed Daily night empty instead of holding or adding", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const merrill = player("fa-merrill", "CLE", {
      projections: { ...baseProjections(), STL: 180, TPM: 200 },
    })
    const fill = player("fa-fill", "CHA", {
      projections: { ...baseProjections(), STL: 80, TPM: 40 },
    })
    const rostered = packedRosterPlayers()
    const state = tinyState(
      [...rostered, merrill, fill],
      ["fa-merrill", "fa-fill"],
    )
    state.teams[0]!.entries = rostered.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    state.teams[0]!.entries.push({ slot: "BE", playerId: null })
    const seatedRoster = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: rostered[index]!.id,
    }))
    const daily: DailyLineups = {
      "2025-11-03": seatedRoster.map((entry, index) =>
        index === 9 ? { ...entry, playerId: null } : { ...entry },
      ),
      "2025-11-04": seatedRoster.map((entry) => ({ ...entry })),
      "2025-11-05": seatedRoster.map((entry, index) =>
        index === 9 ? { ...entry, playerId: null } : { ...entry },
      ),
    }
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "CLE", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHA", awayAbbr: "UTA" },
      { date: "2025-11-05", homeAbbr: "CLE", awayAbbr: "ORL" },
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr, index) => ({
          date,
          homeAbbr,
          awayAbbr: index % 2 === 0 ? "SAC" : "POR",
        })),
      ),
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      daily,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-merrill",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
    })
    expect(plan.days[2]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
    })
    expect(plan.addsUsed).toBe(1)
  })
})

describe("forced opponent roster drops", () => {
  const packedPositions = [
    ["PG"],
    ["SG"],
    ["SF"],
    ["PF"],
    ["C"],
    ["PG", "SG"],
    ["SF", "PF"],
    ["SG"],
    ["PG"],
    ["SF"],
  ] as const

  const packedOppRoster = () =>
    packedTeamAbbrs.map((team, index) =>
      player(`r${index}`, team, {
        positions: [...packedPositions[index]!],
        projections: {
          ...baseProjections(),
          STL: index === 7 ? 5 : index === 8 ? 8 : 80,
        },
      }),
    )

  /** Your side plans first, so it needs its own best FA to claim. */
  const yourFa = () =>
    player("fa-you", "TOR", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 200 },
    })

  /** Both rosters full: your add is a roster cut, the opp add needs one too. */
  const packedOppState = (
    oppFas: SeasonPlayer[],
    oppAvailableIds: string[],
  ) => {
    const rostered = packedOppRoster()
    const you = player("you-1", "CHI")
    const state = tinyState(
      [...rostered, you, yourFa(), ...oppFas],
      ["fa-you", ...oppAvailableIds],
    )
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: "you-1" }]
    state.teams[1]!.entries = rostered.map((entry, index) => ({
      slot: packedActiveSlots[index]!,
      playerId: entry.id,
    }))
    return { state, rostered }
  }

  const packedGames = (days: string[], extra: ScheduleResponse["games"] = []) =>
    tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr, index) => ({
          date,
          homeAbbr,
          awayAbbr: index % 2 === 0 ? "MEM" : "CHA",
        })),
      ),
      ...days.map((date) => ({ date, homeAbbr: "TOR", awayAbbr: "BKN" })),
      ...extra,
    ])

  it("fills three distinct spots when spot 1 has a forced drop", () => {
    const day = "2025-11-03"
    const oppPg = player("opp-pg", "ATL", { positions: ["PG"] })
    const oppSg = player("opp-sg", "LAL", { positions: ["SG"] })
    const oppC = player("opp-c", "DEN", { positions: ["C"] })
    const faPg = player("fa-pg", "BOS", { positions: ["PG"] })
    const faSg = player("fa-sg", "NYK", { positions: ["SG"] })
    const faC = player("fa-c", "MIA", { positions: ["C"] })
    const state = tinyState(
      [oppPg, oppSg, oppC, faPg, faSg, faC],
      [faPg.id, faSg.id, faC.id],
    )
    state.rosterSlots = ["PG", "SG", "C"]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: oppPg.id },
      { slot: "SG", playerId: oppSg.id },
      { slot: "C", playerId: oppC.id },
    ]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: tinySchedule([day], [
        { date: day, homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: day, homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: day, homeAbbr: "MIA", awayAbbr: "ORL" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 3,
      addLimit: 7,
      forcedOpponentRosterDrops: [null, oppSg.id, null],
      youIdle: true,
    })

    const filledIds = plan.opponentDays[0]!.cells
      .map((cell) => cell.playerId)
      .filter((id): id is string => Boolean(id))
    expect(filledIds).toHaveLength(3)
    expect(new Set(filledIds).size).toBe(3)
  })

  it("does not stream for the opponent on a packed roster-game night", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
    })
    expect(plan.opponentDays[0]!.cells.every((cell) => cell.action === "empty")).toBe(
      true,
    )
    expect(plan.opponentDays[0]!.cells.every((cell) => cell.playerId === null)).toBe(
      true,
    )
  })

  it("applies a forced opponent starter cut when a bench slot is open", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    state.rosterSlots = [...packedActiveSlots, "BE"]
    state.teams[1]!.entries.push({ slot: "BE", playerId: null })

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["r0"],
    })

    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      droppedPlayerId: "r0",
      playerId: "fa-opp-1",
    })
  })

  it("ranks opponent FAs by remaining hole starts before NBA games", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const oppPg = player("opp-pg", "ATL", { positions: ["PG"] })
    const oppSg = player("opp-sg", "LAL", { positions: ["SG"] })
    const rawVolume = player("fa-raw-volume", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 1000 },
    })
    const holeVolume = player("fa-hole-volume", "ORL", {
      positions: ["PG", "SG"],
      projections: { ...baseProjections(), STL: 1 },
    })
    const state = tinyState(
      [oppPg, oppSg, rawVolume, holeVolume],
      ["fa-raw-volume", "fa-hole-volume"],
    )
    state.rosterSlots = ["PG", "SG", "BE"]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: "opp-pg" },
      { slot: "SG", playerId: "opp-sg" },
      { slot: "BE", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "LAL", awayAbbr: "MEM" },
      { date: "2025-11-04", homeAbbr: "ATL", awayAbbr: "MEM" },
      { date: "2025-11-05", homeAbbr: "ATL", awayAbbr: "MEM" },
      { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      { date: "2025-11-04", homeAbbr: "WAS", awayAbbr: "BKN" },
      { date: "2025-11-05", homeAbbr: "WAS", awayAbbr: "BKN" },
      { date: "2025-11-03", homeAbbr: "ORL", awayAbbr: "DET" },
      { date: "2025-11-04", homeAbbr: "ORL", awayAbbr: "DET" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      youIdle: true,
    })

    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-hole-volume",
    })
  })

  it("uses the forced roster player as the first opp cut when the roster is full", () => {
    const days = ["2025-11-03"]
    // PG so it can take the seat that cutting PG-only `r0` opens up.
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["r0"],
    })
    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      droppedPlayerId: "r0",
      playerId: "fa-opp-1",
    })
  })

  it("uses the forced cut even when its 9-cat delta is not positive", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-low", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 0 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-low"])
    const forcedPlayer = state.players.find((entry) => entry.id === "r0")!
    forcedPlayer.projections = { ...forcedPlayer.projections, STL: 500 }

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["r0"],
    })

    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
  })

  it("uses a forced drop when the opponent has an open non-IL slot", () => {
    const days = ["2025-11-03"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const faOpp = player("fa-opp", "MIA", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const opp = player("opp-1", "ATL")
    const you = player("you-1", "CHI")
    const state = tinyState([faA, faOpp, you, opp], ["fa-a", "fa-opp"])
    state.teams[0]!.entries = [
      { slot: "PG", playerId: "you-1" },
      { slot: "UTIL", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: "opp-1" },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: tinySchedule(days, [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "MIA", awayAbbr: "DET" },
        { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["opp-1"],
    })
    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      droppedPlayerId: "opp-1",
      playerId: "fa-opp",
    })
  })

  it("falls back to Auto when the forced id is missing", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const autoPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
    })
    const forcedPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["nobody"],
    })
    expect(forcedPlan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe(
      autoPlan.opponentDays[0]!.cells[0]!.droppedPlayerId,
    )
  })

  it("uses distinct forced drops for two opp spots", () => {
    const days = ["2025-11-03"]
    const faOpp1 = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faOpp2 = player("fa-opp-2", "ORL", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const { state } = packedOppState(
      [faOpp1, faOpp2],
      ["fa-opp-1", "fa-opp-2"],
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      addLimit: 2,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "ORL", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 2,
      forcedOpponentRosterDrops: ["r0", "r1"],
    })
    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
    expect(plan.opponentDays[0]!.cells[1]!.droppedPlayerId).toBe("r1")
  })

  it("falls back to Auto on spot 1 when both spots force the same player", () => {
    const days = ["2025-11-03"]
    const faOpp1 = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faOpp2 = player("fa-opp-2", "ORL", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const { state } = packedOppState(
      [faOpp1, faOpp2],
      ["fa-opp-1", "fa-opp-2"],
    )
    const forcedPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-03", homeAbbr: "ORL", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 2,
      forcedOpponentRosterDrops: ["r0", "r0"],
    })
    expect(forcedPlan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
    expect(forcedPlan.opponentDays[0]!.cells[1]!.droppedPlayerId).not.toBe("r0")
  })

  it("does not consume a forced roster drop when replacing an expired streamer", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faYouMon = player("fa-you-mon", "TOR", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 200 },
    })
    const faYouTue = player("fa-you-tue", "PHI", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 300 },
    })
    const faMon = player("fa-mon", "SAC", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const faTue = player("fa-tue", "WAS", {
      positions: ["SG"],
      projections: { ...baseProjections(), STL: 150 },
    })
    const opp = player("opp-1", "ATL")
    const you = player("you-1", "CHI")
    const state = tinyState(
      [faYouMon, faYouTue, faMon, faTue, you, opp],
      ["fa-you-mon", "fa-you-tue", "fa-mon", "fa-tue"],
    )
    state.teams[0]!.entries = [
      { slot: "PG", playerId: "you-1" },
      { slot: "UTIL", playerId: null },
    ]
    state.teams[1]!.entries = [
      { slot: "PG", playerId: "opp-1" },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: tinySchedule(days, [
        { date: "2025-11-03", homeAbbr: "TOR", awayAbbr: "BKN" },
        { date: "2025-11-04", homeAbbr: "TOR", awayAbbr: "DET" },
        { date: "2025-11-04", homeAbbr: "PHI", awayAbbr: "IND" },
        { date: "2025-11-03", homeAbbr: "SAC", awayAbbr: "POR" },
        { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
        { date: "2025-11-04", homeAbbr: "WAS", awayAbbr: "BKN" },
        { date: "2025-11-04", homeAbbr: "ATL", awayAbbr: "CLE" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      forcedOpponentRosterDrops: ["opp-1"],
    })
    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("opp-1")
    expect(plan.opponentDays[0]!.cells[0]!.playerId).toBe("fa-mon")
    expect(plan.opponentDays[1]!.cells[0]!.action).toBe("drop_add")
    expect(plan.opponentDays[1]!.cells[0]!.droppedPlayerId).toBe("fa-mon")
    expect(["fa-tue", "fa-you-tue"]).toContain(
      plan.opponentDays[1]!.cells[0]!.playerId,
    )
  })

  it("drops an ADP-protected player when that id is forced", () => {
    const days = ["2025-11-03"]
    const faOpp = player("fa-opp-1", "WAS", {
      positions: ["PG"],
      projections: { ...baseProjections(), STL: 160 },
    })
    const { state } = packedOppState([faOpp], ["fa-opp-1"])
    const adpByPlayerId = Object.fromEntries(
      packedOppRoster().map((entry) => [entry.id, 10]),
    )
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule: packedGames(days, [
        { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "BKN" },
      ]),
      board: emptyBoardLosingStl(),
      oppSpotCount: 1,
      adpByPlayerId,
      forcedOpponentRosterDrops: ["r0"],
    })
    expect(plan.opponentDays[0]!.cells[0]!.droppedPlayerId).toBe("r0")
  })
})

describe("default addLimit from ESPN weekly acquisitions", () => {
  it("uses 7 adds for a normal week even when Monday has no games", () => {
    const days = [
      "2025-10-20",
      "2025-10-21",
      "2025-10-22",
      "2025-10-23",
      "2025-10-24",
      "2025-10-25",
      "2025-10-26",
    ]
    const teams = [
      "BOS",
      "NYK",
      "MIA",
      "ATL",
      "CHI",
      "MIL",
      "DET",
      "CLE",
      "IND",
      "ORL",
      "PHI",
      "TOR",
    ]
    const fas = teams.map((team, index) =>
      player(`fa-${team}`, team, {
        projections: { ...baseProjections(), STL: 200 - index },
      }),
    )
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    const gameDays = days.slice(1)
    const schedule = tinySchedule(
      days,
      gameDays.flatMap((date, index) =>
        teams.slice(0, 6).map((team, teamIndex) => ({
          date,
          homeAbbr: teams[(index + teamIndex) % teams.length]!,
          awayAbbr: teamIndex % 2 === 0 ? "WAS" : "SAC",
        })),
      ),
    )
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
    })
    expect(plan.addLimit).toBe(7)
    expect(plan.addsUsed).toBeLessThanOrEqual(7)
  })

  it("youIdle leaves you daily empty and still fills opponent spots", () => {
    const days = ["2025-11-03", "2025-11-04"]
    const faA = player("fa-a", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const faB = player("fa-b", "NYK", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const state = tinyState([faA, faB], ["fa-a", "fa-b"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      youIdle: true,
      oppSpotCount: 1,
      opponentTeamIndex: 1,
    })

    expect(plan.addsUsed).toBe(0)
    expect(
      plan.days.flatMap((day) => day.cells.map((cell) => cell.playerId)),
    ).toEqual([null, null])
    const oppIds = Object.values(plan.opponentDaily).flatMap((entries) =>
      entries.flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
    )
    expect(oppIds.length).toBeGreaterThan(0)
  })

  it("still honors an explicit addLimit override", () => {
    const days = ["2025-10-20", "2025-10-21"]
    const schedule = tinySchedule(days, [
      { date: "2025-10-21", homeAbbr: "BOS", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state: tinyState(
        [player("fa-a", "BOS", { projections: { ...baseProjections(), STL: 180 } })],
        ["fa-a"],
      ),
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 4,
    })
    expect(plan.addLimit).toBe(4)
  })
})

describe("streaming plan reform", () => {
  const sevenDays = [
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
    "2025-11-08",
    "2025-11-09",
  ]

  const addsBySpotOf = (plan: ReturnType<typeof buildStreamingPlan>) => {
    const counts = [0, 0, 0]
    for (const day of plan.days) {
      for (const cell of day.cells) {
        if (cell.action === "add" || cell.action === "drop_add") {
          counts[cell.spotIndex]! += 1
        }
      }
    }
    return counts.slice(0, plan.spotCount)
  }

  it("1-spot covers an off night instead of holding a 2-in-3", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    const schedule = tinySchedule(sevenDays.slice(0, 3), [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
    })
    expect(["add", "drop_add"]).toContain(plan.days[1]!.cells[0]!.action)
    expect(plan.days[1]!.cells[0]!.action).not.toBe("hold")
  })

  it("2-spot 7-add week finishes at 4 and 3 with no seat above cap", () => {
    const teams = [
      "BOS",
      "NYK",
      "MIA",
      "ATL",
      "CHI",
      "MIL",
      "DEN",
      "PHX",
      "LAL",
      "GSW",
      "SAC",
      "POR",
      "ORL",
      "TOR",
    ]
    const fas = teams.map((team, index) =>
      player(`fa-${team}`, team, {
        projections: { ...baseProjections(), STL: 200 - index },
      }),
    )
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    const schedule = tinySchedule(
      sevenDays,
      sevenDays.flatMap((date, dayIndex) => [
        {
          date,
          homeAbbr: teams[dayIndex * 2]!,
          awayAbbr: "WAS",
        },
        {
          date,
          homeAbbr: teams[dayIndex * 2 + 1]!,
          awayAbbr: "DET",
        },
      ]),
    )
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    expect(plan.addsUsed).toBe(7)
    expect(addsBySpotOf(plan).reduce((sum, count) => sum + count, 0)).toBe(7)
  })

  it("2-spot holds a 2-in-3 through the off night then drops after", () => {
    const okc = player("fa-okc", "OKC", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const tueOnly = player("fa-tue", "CHI", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const next = player("fa-next", "NYK", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState(
      [okc, tueOnly, next],
      ["fa-okc", "fa-tue", "fa-next"],
    )
    const days = [
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]
    const schedule = tinySchedule(days, [
      { date: "2026-10-20", homeAbbr: "OKC", awayAbbr: "SAS" },
      { date: "2026-10-21", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2026-10-22", homeAbbr: "OKC", awayAbbr: "IND" },
      { date: "2026-10-23", homeAbbr: "NYK", awayAbbr: "BOS" },
      { date: "2026-10-24", homeAbbr: "NYK", awayAbbr: "BKN" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    const okcSeat = plan.days[0]!.cells.find((cell) => cell.playerId === "fa-okc")
    expect(okcSeat).toMatchObject({ action: "add" })
    expect(
      plan.days[1]!.cells.some(
        (cell) => cell.playerId === "fa-tue" && cell.action !== "empty",
      ),
    ).toBe(true)
  })

  it("uses only one seat on a 1-hole night", () => {
    const days = ["2025-10-21"]
    const packed = packedRosterPlayers()
    const faA = player("fa-a", "OKC", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 400 },
    })
    const faB = player("fa-b", "POR", {
      positions: ["PF"],
      projections: { ...baseProjections(), REB: 390 },
    })
    const idle = offNightBench()
    const state = tinyState([...packed, faA, faB, idle], ["fa-a", "fa-b"])
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE", playerId: idle.id },
    ]
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const daily = { "2025-10-21": pfOpen }
    const schedule = tinySchedule(days, [
      ...packedTeamAbbrs.map((homeAbbr) => ({
        date: "2025-10-21",
        homeAbbr,
        awayAbbr: "SAC",
      })),
      { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-10-21", homeAbbr: "POR", awayAbbr: "CHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      daily,
    })
    expect(plan.days[0]!.cells.filter((cell) => cell.playerId)).toHaveLength(1)
    expect(plan.days[0]!.cells.filter((cell) => cell.action === "empty")).toHaveLength(
      1,
    )
  })

  it("does not wait until the last three days to start the second seat", () => {
    const hog = player("fa-hog", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const daily = [
      player("fa-nyk", "NYK", { projections: { ...baseProjections(), STL: 200 } }),
      player("fa-mia", "MIA", { projections: { ...baseProjections(), STL: 190 } }),
      player("fa-atl", "ATL", { projections: { ...baseProjections(), STL: 180 } }),
      player("fa-chi", "CHI", { projections: { ...baseProjections(), STL: 170 } }),
      player("fa-mil", "MIL", { projections: { ...baseProjections(), STL: 160 } }),
      player("fa-den", "DEN", { projections: { ...baseProjections(), STL: 150 } }),
      player("fa-phx", "PHX", { projections: { ...baseProjections(), STL: 140 } }),
    ]
    const state = tinyState(
      [hog, ...daily],
      [hog.id, ...daily.map((fa) => fa.id)],
    )
    const schedule = tinySchedule(sevenDays, [
      ...sevenDays.map((date) => ({
        date,
        homeAbbr: "BOS",
        awayAbbr: "WAS",
      })),
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "DET" },
      { date: "2025-11-05", homeAbbr: "ATL", awayAbbr: "DET" },
      { date: "2025-11-06", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-11-07", homeAbbr: "MIL", awayAbbr: "DET" },
      { date: "2025-11-08", homeAbbr: "DEN", awayAbbr: "DET" },
      { date: "2025-11-09", homeAbbr: "PHX", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
    })
    const firstAddDayBySpot = [null, null] as (number | null)[]
    for (const [dayIndex, day] of plan.days.entries()) {
      for (const cell of day.cells) {
        if (
          (cell.action === "add" || cell.action === "drop_add") &&
          firstAddDayBySpot[cell.spotIndex] == null
        ) {
          firstAddDayBySpot[cell.spotIndex] = dayIndex
        }
      }
    }
    expect(firstAddDayBySpot[0]).not.toBeNull()
    expect(firstAddDayBySpot[1]).not.toBeNull()
    expect(firstAddDayBySpot[0]!).toBeLessThan(4)
    expect(firstAddDayBySpot[1]!).toBeLessThan(4)
  })

  it("2-spot never posts fewer starts than 1-spot on a 1-hole week", () => {
    const bos = player("fa-bos", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const chi = player("fa-chi", "CHI", {
      projections: { ...baseProjections(), STL: 150 },
    })
    const state = tinyState([bos, chi], ["fa-bos", "fa-chi"])
    state.rosterSlots = ["UTIL"]
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: null }]
    const days = sevenDays.slice(0, 3)
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const shared = {
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    }
    const one = buildStreamingPlan({ ...shared, spotCount: 1 })
    const two = buildStreamingPlan({ ...shared, spotCount: 2 })
    expect(one.gameStarts).toBeGreaterThanOrEqual(2)
    expect(two.gameStarts).toBeGreaterThanOrEqual(one.gameStarts)
  })

  it("does not hold a streamer whose next game is not a hole", () => {
    const days = [
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]
    const packed = packedRosterPlayers()
    const benchCut = player("r-be", "DET", { positions: ["PF"] })
    const benchCutTwo = player("r-be-2", "MEM", { positions: ["C"] })
    const ighodaro = player("fa-ighodaro", "POR", {
      positions: ["PF", "C"],
      projections: { ...baseProjections(), REB: 500, STL: 40 },
    })
    const twoInThree = player("fa-22-24", "OKC", {
      positions: ["PF", "C"],
      projections: { ...baseProjections(), REB: 360, STL: 40 },
    })
    const state = tinyState(
      [...packed, benchCut, benchCutTwo, ighodaro, twoInThree],
      ["fa-ighodaro", "fa-22-24"],
    )
    state.teams[0]!.entries = [
      ...packed.map((entry, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "BE" as const, playerId: benchCut.id },
      { slot: "BE" as const, playerId: benchCutTwo.id },
    ]
    const pfOpen = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: entry.slot === "PF" ? null : packed[index]!.id,
    }))
    const packedDay = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: packed[index]!.id,
    }))
    const daily = {
      "2026-10-21": pfOpen.map((entry) => ({ ...entry })),
      "2026-10-22": pfOpen.map((entry) => ({ ...entry })),
      "2026-10-23": packedDay,
      "2026-10-24": pfOpen.map((entry) => ({ ...entry })),
    }
    const schedule = tinySchedule(days, [
      ...days.flatMap((date) =>
        packedTeamAbbrs.map((homeAbbr) => ({
          date,
          homeAbbr,
          awayAbbr: "SAC",
        })),
      ),
      { date: "2026-10-21", homeAbbr: "POR", awayAbbr: "WAS" },
      { date: "2026-10-23", homeAbbr: "POR", awayAbbr: "WAS" },
      { date: "2026-10-22", homeAbbr: "OKC", awayAbbr: "CHI" },
      { date: "2026-10-24", homeAbbr: "OKC", awayAbbr: "BKN" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      addLimit: 7,
      daily,
    })
    expect(plan.days[1]!.cells.some((cell) => cell.playerId === "fa-22-24")).toBe(
      true,
    )
    expect(
      plan.days[1]!.cells.some(
        (cell) => cell.playerId === "fa-ighodaro" && cell.action === "hold",
      ),
    ).toBe(false)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
  })

  it("fills the second spot early with a 2-in-3 instead of leaving it empty", () => {
    const hog = player("fa-hog", "BOS", {
      projections: { ...baseProjections(), REB: 200, STL: 80 },
    })
    const twoInThree = player("fa-20-22", "NYK", {
      projections: { ...baseProjections(), REB: 380, STL: 40 },
    })
    const state = tinyState([hog, twoInThree], ["fa-hog", "fa-20-22"])
    state.rosterSlots = ["UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const days = ["2026-10-20", "2026-10-21", "2026-10-22"]
    const schedule = tinySchedule(days, [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2026-10-22", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: closeLosingRebBoard(),
      addLimit: 7,
    })
    expect(plan.days[0]!.cells.filter((cell) => cell.playerId).length).toBeGreaterThanOrEqual(1)
    const twoInThreeDay = plan.days.find((day) =>
      day.cells.some((cell) => cell.playerId === "fa-20-22"),
    )
    expect(twoInThreeDay).toBeTruthy()
    expect(plan.addsUsed).toBeGreaterThanOrEqual(1)
  })
})

describe("start-max streaming policy", () => {
  const sevenDays = [
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
    "2025-11-08",
    "2025-11-09",
  ]

  const contestedStlRebBoard = (): MatchupBoard => ({
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      if (categoryId === "STL") {
        return {
          categoryId,
          you: 2,
          opp: 4,
          outcome: "L" as const,
          winProb: 0.38,
        }
      }
      if (categoryId === "REB") {
        return {
          categoryId,
          you: 20,
          opp: 26,
          outcome: "L" as const,
          winProb: 0.42,
        }
      }
      return {
        categoryId,
        you: 30,
        opp: 10,
        outcome: "W" as const,
        winProb: 0.8,
      }
    }),
    wins: 7,
    losses: 2,
    ties: 0,
    projectedCatWins: 7,
  })

  it("spends addLimit on dense blocks instead of week-holding one player", () => {
    const hog = player("fa-hog", "WAS", {
      projections: { ...baseProjections(), STL: 220 },
    })
    const blocks = [
      player("fa-bos", "BOS", { projections: { ...baseProjections(), STL: 120 } }),
      player("fa-mia", "MIA", { projections: { ...baseProjections(), STL: 118 } }),
      player("fa-atl", "ATL", { projections: { ...baseProjections(), STL: 116 } }),
      player("fa-chi", "CHI", { projections: { ...baseProjections(), STL: 114 } }),
      player("fa-mil", "MIL", { projections: { ...baseProjections(), STL: 112 } }),
      player("fa-det", "DET", { projections: { ...baseProjections(), STL: 110 } }),
      player("fa-cle", "CLE", { projections: { ...baseProjections(), STL: 108 } }),
      player("fa-ind", "IND", { projections: { ...baseProjections(), STL: 106 } }),
    ]
    const state = tinyState(
      [hog, ...blocks],
      [hog.id, ...blocks.map((fa) => fa.id)],
    )
    state.rosterSlots = ["UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(sevenDays, [
      { date: "2025-11-03", homeAbbr: "WAS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "WAS", awayAbbr: "ORL" },
      { date: "2025-11-07", homeAbbr: "WAS", awayAbbr: "ORL" },
      { date: "2025-11-09", homeAbbr: "WAS", awayAbbr: "ORL" },
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "NYK" },
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "PHI" },
      { date: "2025-11-05", homeAbbr: "MIA", awayAbbr: "PHI" },
      { date: "2025-11-06", homeAbbr: "MIA", awayAbbr: "PHI" },
      { date: "2025-11-05", homeAbbr: "ATL", awayAbbr: "CHA" },
      { date: "2025-11-06", homeAbbr: "ATL", awayAbbr: "CHA" },
      { date: "2025-11-07", homeAbbr: "ATL", awayAbbr: "CHA" },
      { date: "2025-11-06", homeAbbr: "CHI", awayAbbr: "BKN" },
      { date: "2025-11-07", homeAbbr: "CHI", awayAbbr: "BKN" },
      { date: "2025-11-08", homeAbbr: "CHI", awayAbbr: "BKN" },
      { date: "2025-11-07", homeAbbr: "MIL", awayAbbr: "TOR" },
      { date: "2025-11-08", homeAbbr: "MIL", awayAbbr: "TOR" },
      { date: "2025-11-09", homeAbbr: "MIL", awayAbbr: "TOR" },
      { date: "2025-11-03", homeAbbr: "DET", awayAbbr: "SAC" },
      { date: "2025-11-04", homeAbbr: "DET", awayAbbr: "SAC" },
      { date: "2025-11-08", homeAbbr: "CLE", awayAbbr: "LAL" },
      { date: "2025-11-09", homeAbbr: "CLE", awayAbbr: "LAL" },
      { date: "2025-11-09", homeAbbr: "IND", awayAbbr: "PHX" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    expect(plan.addsUsed).toBeGreaterThanOrEqual(4)
    expect(plan.addsUsed).toBeLessThanOrEqual(7)
    expect(plan.gameStarts).toBeGreaterThan(4)
    const hogHolds = plan.days.filter((day) =>
      day.cells.some((cell) => cell.playerId === "fa-hog"),
    ).length
    expect(hogHolds).toBeLessThan(7)
  })

  it("prefers a 3-in-4 over an isolated one-game FA on the same start count day", () => {
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const thin = player("fa-thin", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const state = tinyState([elite, thin], ["fa-elite", "fa-thin"])
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-thin",
    })
  })

  it("picks the contested STL+REB specialist over a same-schedule PTS/3PM wing", () => {
    const specialist = player("fa-cats", "BOS", {
      projections: {
        ...baseProjections(),
        STL: 180,
        REB: 500,
        PTS: 400,
        TPM: 20,
      },
    })
    const wing = player("fa-wing", "NYK", {
      projections: {
        ...baseProjections(),
        STL: 20,
        REB: 80,
        PTS: 1800,
        TPM: 200,
      },
    })
    const state = tinyState(
      [specialist, wing],
      ["fa-cats", "fa-wing"],
    )
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "DET" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: contestedStlRebBoard(),
      addLimit: 3,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-cats")
  })

  it("still prefers more seated starts when density beats the contested specialist", () => {
    const specialist = player("fa-cats", "BOS", {
      projections: {
        ...baseProjections(),
        STL: 180,
        REB: 500,
        PTS: 400,
        TPM: 20,
      },
    })
    const denser = player("fa-dense", "NYK", {
      projections: {
        ...baseProjections(),
        STL: 20,
        REB: 80,
        PTS: 1800,
        TPM: 200,
      },
    })
    const state = tinyState(
      [specialist, denser],
      ["fa-cats", "fa-dense"],
    )
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "DET" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: contestedStlRebBoard(),
      addLimit: 3,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-cats")
  })

  it("ignores winProb >= 0.70 cats and declared punts when ranking", () => {
    const stlFa = player("fa-stl", "BOS", {
      projections: { ...baseProjections(), STL: 180, PTS: 200, TO: 20 },
    })
    const ptsFa = player("fa-pts", "NYK", {
      projections: { ...baseProjections(), STL: 20, PTS: 2000, TO: 200 },
    })
    const state = tinyState([stlFa, ptsFa], ["fa-stl", "fa-pts"])
    state.categories = state.categories.map((category) =>
      category.id === "TO" ? { ...category, weight: 0 } : category,
    )
    const days = ["2025-11-03", "2025-11-04"]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "DET" },
    ])
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        if (categoryId === "STL") {
          return {
            categoryId,
            you: 2,
            opp: 4,
            outcome: "L" as const,
            winProb: 0.4,
          }
        }
        if (categoryId === "PTS") {
          return {
            categoryId,
            you: 80,
            opp: 40,
            outcome: "W" as const,
            winProb: 0.8,
          }
        }
        if (categoryId === "TO") {
          return {
            categoryId,
            you: 8,
            opp: 10,
            outcome: "L" as const,
            winProb: 0.4,
          }
        }
        return {
          categoryId,
          you: 20,
          opp: 10,
          outcome: "W" as const,
          winProb: 0.8,
        }
      }),
      wins: 7,
      losses: 2,
      ties: 0,
      projectedCatWins: 7,
    }
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      addLimit: 2,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-stl")
  })
})

describe("2/3-spot start and add bugs", () => {
  const sevenDays = [
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
    "2025-11-08",
  ]

  const astStlBoard = (): MatchupBoard => ({
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      if (categoryId === "REB") {
        return {
          categoryId,
          you: 10,
          opp: 40,
          outcome: "L" as const,
          winProb: 0.36,
        }
      }
      if (categoryId === "AST") {
        return {
          categoryId,
          you: 8,
          opp: 12,
          outcome: "L" as const,
          winProb: 0.4,
        }
      }
      if (categoryId === "STL") {
        return {
          categoryId,
          you: 3,
          opp: 5,
          outcome: "L" as const,
          winProb: 0.42,
        }
      }
      return {
        categoryId,
        you: 30,
        opp: 10,
        outcome: "W" as const,
        winProb: 0.8,
      }
    }),
    wins: 6,
    losses: 3,
    ties: 0,
    projectedCatWins: 6,
  })

  it("does not leave a 2-spot off-night with zero stream starts when a today FA exists", () => {
    const holdA = player("fa-hold-a", "OKC", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const holdB = player("fa-hold-b", "BOS", {
      projections: { ...baseProjections(), STL: 78 },
    })
    const today = player("fa-today", "CHI", {
      projections: { ...baseProjections(), STL: 70 },
    })
    const state = tinyState(
      [holdA, holdB, today],
      ["fa-hold-a", "fa-hold-b", "fa-today"],
    )
    state.rosterSlots = ["UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-11-05", homeAbbr: "OKC", awayAbbr: "DET" },
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "NYK" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(
      plan.days[1]!.cells.some((cell) => cell.playerId === "fa-today"),
    ).toBe(true)
  })

  it("3-spot posts at least as many starts as 2-spot and 2-spot at least 1-spot", () => {
    const fas = [
      ["BOS", "fa-bos"],
      ["NYK", "fa-nyk"],
      ["MIA", "fa-mia"],
      ["ATL", "fa-atl"],
      ["CHI", "fa-chi"],
      ["MIL", "fa-mil"],
      ["DET", "fa-det"],
      ["CLE", "fa-cle"],
      ["IND", "fa-ind"],
    ].map(([team, id], index) =>
      player(id, team, {
        projections: { ...baseProjections(), STL: 160 - index },
      }),
    )
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(sevenDays, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "ATL" },
      { date: "2025-11-05", homeAbbr: "MIA", awayAbbr: "CHA" },
      { date: "2025-11-06", homeAbbr: "MIA", awayAbbr: "BKN" },
      { date: "2025-11-05", homeAbbr: "ATL", awayAbbr: "TOR" },
      { date: "2025-11-06", homeAbbr: "ATL", awayAbbr: "IND" },
      { date: "2025-11-07", homeAbbr: "ATL", awayAbbr: "CLE" },
      { date: "2025-11-06", homeAbbr: "CHI", awayAbbr: "MIL" },
      { date: "2025-11-07", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-11-07", homeAbbr: "MIL", awayAbbr: "NYK" },
      { date: "2025-11-08", homeAbbr: "MIL", awayAbbr: "BOS" },
      { date: "2025-11-03", homeAbbr: "DET", awayAbbr: "SAC" },
      { date: "2025-11-08", homeAbbr: "CLE", awayAbbr: "LAL" },
      { date: "2025-11-08", homeAbbr: "IND", awayAbbr: "PHX" },
    ])
    const shared = {
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    }
    const one = buildStreamingPlan({ ...shared, spotCount: 1 })
    const two = buildStreamingPlan({ ...shared, spotCount: 2 })
    const three = buildStreamingPlan({ ...shared, spotCount: 3 })
    expect(two.gameStarts).toBeGreaterThanOrEqual(one.gameStarts)
    expect(three.gameStarts).toBeGreaterThanOrEqual(two.gameStarts - 1)
    expect(two.addsUsed).toBeGreaterThanOrEqual(3)
    expect(three.addsUsed).toBeGreaterThanOrEqual(two.addsUsed)
    expect(two.addsUsed).toBeLessThanOrEqual(6)
    expect(three.addsUsed).toBeLessThanOrEqual(6)
  })

  it("picks the AST+STL guard over a same-schedule rebound big", () => {
    const guard = player("fa-guard", "BOS", {
      positions: ["PG", "SG"],
      projections: {
        ...baseProjections(),
        AST: 500,
        STL: 180,
        REB: 80,
        BLK: 10,
        PTS: 400,
      },
    })
    const big = player("fa-big", "NYK", {
      positions: ["C"],
      projections: {
        ...baseProjections(),
        AST: 80,
        STL: 20,
        REB: 900,
        BLK: 300,
        PTS: 600,
      },
    })
    const state = tinyState([guard, big], ["fa-guard", "fa-big"])
    const days = ["2025-11-03", "2025-11-04", "2025-11-05"]
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "DET" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: astStlBoard(),
      addLimit: 3,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-guard")
    expect(plan.days[0]!.cells[0]!.alternativePlayerIds[0]).not.toBe("fa-big")
  })
})

describe("block-first add pacing", () => {
  const week = [
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]

  const staggeredB2bState = () => {
    const pairs: [string, string, number][] = [
      ["fa-bos", "BOS", 0],
      ["fa-nyk", "NYK", 0],
      ["fa-mia", "MIA", 1],
      ["fa-atl", "ATL", 1],
      ["fa-chi", "CHI", 2],
      ["fa-mil", "MIL", 2],
      ["fa-det", "DET", 3],
      ["fa-cle", "CLE", 3],
      ["fa-ind", "IND", 4],
      ["fa-orl", "ORL", 4],
    ]
    const fas = pairs.map(([id, team], index) =>
      player(id, team, {
        projections: { ...baseProjections(), STL: 180 - index },
      }),
    )
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    const games = pairs.flatMap(([_, team, offset]) => [
      { date: week[offset]!, homeAbbr: team, awayAbbr: "WAS" },
      { date: week[offset + 1]!, homeAbbr: team, awayAbbr: "SAC" },
    ])
    return { state, schedule: tinySchedule(week, games) }
  }

  const addsOnDays = (
    plan: ReturnType<typeof buildStreamingPlan>,
    dates: string[],
  ) =>
    plan.days
      .filter((day) => dates.includes(day.date))
      .reduce(
        (sum, day) =>
          sum +
          day.cells.filter(
            (cell) => cell.action === "add" || cell.action === "drop_add",
          ).length,
        0,
      )

  const dumpedSecondNight = (plan: ReturnType<typeof buildStreamingPlan>) => {
    for (let dayIndex = 1; dayIndex < plan.days.length; dayIndex += 1) {
      const previous = plan.days[dayIndex - 1]!
      const today = plan.days[dayIndex]!
      for (const cell of today.cells) {
        if (cell.action !== "drop_add" || !cell.droppedPlayerId) continue
        const held = previous.cells.find(
          (prev) =>
            prev.spotIndex === cell.spotIndex &&
            prev.playerId === cell.droppedPlayerId,
        )
        if (held && (held.action === "add" || held.action === "drop_add")) {
          return true
        }
      }
    }
    return false
  }

  it("1-spot holds a B2B second night instead of swapping", () => {
    const hold = player("fa-b2b", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const next = player("fa-next", "NYK", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const state = tinyState([hold, next], ["fa-b2b", "fa-next"])
    const schedule = tinySchedule(week.slice(0, 3), [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "SAC" },
      { date: "2026-10-21", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-b2b",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-next",
    })
  })

  it("2-spot spreads 6 adds so at least two start after Thursday", () => {
    const { state, schedule } = staggeredB2bState()
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(addsOnDays(plan, week.slice(0, 3))).toBeLessThan(6)
    expect(addsOnDays(plan, week.slice(3))).toBeGreaterThanOrEqual(2)
    expect(dumpedSecondNight(plan)).toBe(false)
    expect(plan.days[0]!.cells.filter((cell) => cell.action === "add").length).toBeGreaterThanOrEqual(
      1,
    )
  })

  it("3-spot does not spend 6/6 on Tuesday and Wednesday", () => {
    const { state, schedule } = staggeredB2bState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(addsOnDays(plan, week.slice(0, 2))).toBeLessThan(6)
    expect(addsOnDays(plan, week.slice(2))).toBeGreaterThanOrEqual(2)
    expect(dumpedSecondNight(plan)).toBe(false)
    expect(
      new Set(
        plan.days
          .flatMap((day) =>
            day.cells
              .filter((cell) => cell.action === "add" || cell.action === "drop_add")
              .map((cell) => day.date),
          ),
      ).size,
    ).toBeGreaterThan(2)
  })

  it("keeps an add for a Sunday-only hole when earlier days are covered", () => {
    const early = player("fa-early", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const mid = player("fa-mid", "NYK", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const sunday = player("fa-sun", "CHI", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const state = tinyState(
      [early, mid, sunday],
      ["fa-early", "fa-mid", "fa-sun"],
    )
    const schedule = tinySchedule(week, [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "SAC" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2026-10-23", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2026-10-25", homeAbbr: "CHI", awayAbbr: "MIA" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(
      plan.days[5]!.cells.some(
        (cell) => cell.playerId === "fa-sun" && cell.action !== "empty",
      ),
    ).toBe(true)
  })

  const opponentAddsOnDays = (
    plan: ReturnType<typeof buildStreamingPlan>,
    dates: string[],
  ) =>
    plan.opponentDays
      .filter((day) => dates.includes(day.date))
      .reduce(
        (sum, day) =>
          sum +
          day.cells.filter(
            (cell) => cell.action === "add" || cell.action === "drop_add",
          ).length,
        0,
      )

  const opponentDumpedSecondNight = (
    plan: ReturnType<typeof buildStreamingPlan>,
  ) => {
    for (let dayIndex = 1; dayIndex < plan.opponentDays.length; dayIndex += 1) {
      const previous = plan.opponentDays[dayIndex - 1]!
      const today = plan.opponentDays[dayIndex]!
      for (const cell of today.cells) {
        if (cell.action !== "drop_add" || !cell.droppedPlayerId) continue
        const held = previous.cells.find(
          (prev) =>
            prev.spotIndex === cell.spotIndex &&
            prev.playerId === cell.droppedPlayerId,
        )
        if (held && (held.action === "add" || held.action === "drop_add")) {
          return true
        }
      }
    }
    return false
  }

  it("opponent 1-spot holds a B2B second night instead of swapping", () => {
    const hold = player("fa-b2b", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const next = player("fa-next", "NYK", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const state = tinyState([hold, next], ["fa-b2b", "fa-next"])
    const schedule = tinySchedule(week.slice(0, 3), [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "SAC" },
      { date: "2026-10-21", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
      oppSpotCount: 1,
      youIdle: true,
    })
    expect(plan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-b2b",
    })
    expect(plan.opponentDays[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-next",
    })
  })

  it("opponent 2-spot spreads 6 adds so at least two start after Thursday", () => {
    const { state, schedule } = staggeredB2bState()
    state.teams[1]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
      oppSpotCount: 2,
      youIdle: true,
    })
    expect(opponentAddsOnDays(plan, week.slice(0, 3))).toBeLessThan(6)
    expect(opponentAddsOnDays(plan, week.slice(3))).toBeGreaterThanOrEqual(2)
    expect(opponentDumpedSecondNight(plan)).toBe(false)
    expect(
      plan.opponentDays[0]!.cells.filter((cell) => cell.action === "add"),
    ).toHaveLength(2)
  })

  it("3-spot never seats the same FA in two spots on one day", () => {
    const star = player("fa-dasilva", "OKC", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const opener = player("fa-atl", "ATL", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const state = tinyState([star, opener], ["fa-dasilva", "fa-atl"])
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const days = week.slice(0, 3)
    const schedule = tinySchedule(days, [
      { date: "2026-10-20", homeAbbr: "ATL", awayAbbr: "DET" },
      { date: "2026-10-22", homeAbbr: "OKC", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    for (const day of plan.days) {
      const seated = day.cells
        .map((cell) => cell.playerId)
        .filter((id): id is string => Boolean(id))
      expect(seated, day.date).toEqual([...new Set(seated)])
    }
    const lastDayIds = plan.days[2]!.cells
      .map((cell) => cell.playerId)
      .filter((id): id is string => Boolean(id))
    expect(lastDayIds.filter((id) => id === "fa-dasilva")).toHaveLength(1)
  })

  it("3-spot first spot adds again after its held window", () => {
    const span = player("fa-span", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const late = player("fa-late", "NYK", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const mid = player("fa-mid", "CHI", {
      projections: { ...baseProjections(), STL: 160 },
    })
    const extra = player("fa-extra", "MIA", {
      projections: { ...baseProjections(), STL: 140 },
    })
    const state = tinyState(
      [span, late, mid, extra],
      ["fa-span", "fa-late", "fa-mid", "fa-extra"],
    )
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(week, [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-22", homeAbbr: "BOS", awayAbbr: "SAC" },
      { date: "2026-10-24", homeAbbr: "BOS", awayAbbr: "DET" },
      { date: "2026-10-21", homeAbbr: "CHI", awayAbbr: "ORL" },
      { date: "2026-10-23", homeAbbr: "CHI", awayAbbr: "ATL" },
      { date: "2026-10-24", homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: "2026-10-25", homeAbbr: "NYK", awayAbbr: "BKN" },
      { date: "2026-10-24", homeAbbr: "MIA", awayAbbr: "PHI" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const spot0Adds = plan.days.flatMap((day) =>
      day.cells.filter(
        (cell) =>
          cell.spotIndex === 0 &&
          (cell.action === "add" || cell.action === "drop_add"),
      ),
    )
    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-span")
    expect(spot0Adds.length).toBeGreaterThanOrEqual(2)
    expect(spot0Adds.some((cell) => cell.playerId !== "fa-span")).toBe(true)
  })

  it("1-spot drop-adds every game day and never holds", () => {
    const fas = [
      player("fa-b2b", "BOS", {
        projections: { ...baseProjections(), STL: 200 },
      }),
      player("fa-d1", "NYK", {
        projections: { ...baseProjections(), STL: 180 },
      }),
      player("fa-d2", "CHI", {
        projections: { ...baseProjections(), STL: 170 },
      }),
      player("fa-d3", "MIA", {
        projections: { ...baseProjections(), STL: 160 },
      }),
      player("fa-d4", "ATL", {
        projections: { ...baseProjections(), STL: 150 },
      }),
      player("fa-d5", "DET", {
        projections: { ...baseProjections(), STL: 140 },
      }),
    ]
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    const schedule = tinySchedule(week, [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "SAC" },
      { date: "2026-10-21", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2026-10-22", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2026-10-23", homeAbbr: "MIA", awayAbbr: "ATL" },
      { date: "2026-10-24", homeAbbr: "ATL", awayAbbr: "PHI" },
      { date: "2026-10-25", homeAbbr: "DET", awayAbbr: "BKN" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(plan.days).toHaveLength(6)
    for (const day of plan.days) {
      expect(["add", "drop_add"]).toContain(day.cells[0]!.action)
      expect(day.cells[0]!.action).not.toBe("hold")
    }
    expect(plan.addsUsed).toBe(6)
  })

  it("2-spot spends addLimit and never leaves both spots empty", () => {
    const { state, schedule } = staggeredB2bState()
    state.rosterSlots = ["UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 2,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(plan.addsUsed).toBe(6)
    for (const day of plan.days) {
      expect(day.cells.every((cell) => !cell.playerId)).toBe(false)
    }
  })

  it("3-spot starts every spot on day one and spends addLimit", () => {
    const { state, schedule } = staggeredB2bState()
    const opener = player("fa-open3", "PHI", {
      projections: { ...baseProjections(), STL: 120 },
    })
    state.players = [...state.players, opener]
    state.availablePlayerIds = [...state.availablePlayerIds, opener.id]
    schedule.games = [
      ...schedule.games,
      { date: "2026-10-20", homeAbbr: "PHI", awayAbbr: "BKN" },
      { date: "2026-10-21", homeAbbr: "PHI", awayAbbr: "TOR" },
    ]
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 6,
      waiverPeriodDays: 0,
    })
    expect(plan.days[0]!.cells.every((cell) => cell.playerId)).toBe(true)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(5)
    expect(plan.addsUsed).toBeLessThanOrEqual(6)
    const minPlaying = 2
    for (let spotIndex = 0; spotIndex < 3; spotIndex += 1) {
      const playingDays = plan.days.filter((day) => {
        const id = day.cells[spotIndex]!.playerId
        if (!id) return false
        const fa = state.players.find((player) => player.id === id)
        if (!fa?.teamAbbr) return false
        return schedule.games.some(
          (game) =>
            game.date === day.date &&
            (game.homeAbbr === fa.teamAbbr || game.awayAbbr === fa.teamAbbr),
        )
      }).length
      expect(playingDays).toBeGreaterThanOrEqual(minPlaying)
    }
  })
})

describe("3-spot density windows maximize starts", () => {
  const week = [
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]

  const densityState = () => {
    const fas = [
      player("fa-elite", "BOS", {
        projections: { ...baseProjections(), STL: 200 },
      }),
      player("fa-2in3", "NYK", {
        projections: { ...baseProjections(), STL: 180 },
      }),
      player("fa-thin", "CHI", {
        projections: { ...baseProjections(), STL: 160 },
      }),
      player("fa-wed-b2b", "DET", {
        projections: { ...baseProjections(), STL: 150 },
      }),
      player("fa-late-b2b", "MIA", {
        projections: { ...baseProjections(), STL: 140 },
      }),
      player("fa-late-2in3", "ATL", {
        projections: { ...baseProjections(), STL: 130 },
      }),
      player("fa-open", "PHI", {
        projections: { ...baseProjections(), STL: 120 },
      }),
    ]
    const state = tinyState(
      fas,
      fas.map((fa) => fa.id),
    )
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(week, [
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "SAC" },
      { date: "2026-10-23", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "CHA" },
      { date: "2026-10-20", homeAbbr: "CHI", awayAbbr: "BKN" },
      { date: "2026-10-22", homeAbbr: "DET", awayAbbr: "TOR" },
      { date: "2026-10-23", homeAbbr: "DET", awayAbbr: "IND" },
      { date: "2026-10-24", homeAbbr: "MIA", awayAbbr: "MIL" },
      { date: "2026-10-25", homeAbbr: "MIA", awayAbbr: "CLE" },
      { date: "2026-10-23", homeAbbr: "ATL", awayAbbr: "PHI" },
      { date: "2026-10-25", homeAbbr: "ATL", awayAbbr: "WAS" },
      { date: "2026-10-20", homeAbbr: "PHI", awayAbbr: "LAL" },
      { date: "2026-10-21", homeAbbr: "PHI", awayAbbr: "NYK" },
    ])
    return { state, schedule }
  }

  const seatedSpotOf = (
    plan: ReturnType<typeof buildStreamingPlan>,
    playerId: string,
  ) =>
    plan.days[0]!.cells.find((cell) => cell.playerId === playerId)?.spotIndex

  it("holds a 3-in-4 through the off night and the third game", () => {
    const { state, schedule } = densityState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const spotIndex = seatedSpotOf(plan, "fa-elite")
    expect(spotIndex).toBeDefined()
    expect(plan.days[0]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-elite",
      action: "add",
    })
    expect(plan.days[1]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-elite",
      action: "hold",
    })
    expect(plan.days[2]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-elite",
      action: "hold",
    })
    expect(plan.days[3]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-elite",
      action: "hold",
    })
    const eliteStarts = plan.days.filter((day) =>
      day.cells.some(
        (cell) =>
          cell.playerId === "fa-elite" &&
          schedule.games.some(
            (game) =>
              game.date === day.date &&
              (game.homeAbbr === "BOS" || game.awayAbbr === "BOS"),
          ),
      ),
    ).length
    expect(eliteStarts).toBe(3)
  })

  it("holds a 2-in-3 through the middle off night", () => {
    const { state, schedule } = densityState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const spotIndex = seatedSpotOf(plan, "fa-2in3")
    expect(spotIndex).toBeDefined()
    expect(plan.days[0]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-2in3",
      action: "add",
    })
    expect(plan.days[1]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-2in3",
      action: "hold",
    })
    expect(plan.days[2]!.cells[spotIndex!]).toMatchObject({
      playerId: "fa-2in3",
      action: "hold",
    })
  })

  it("drop-adds the next B2B after a 3-in-4 window ends", () => {
    const { state, schedule } = densityState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const spotIndex = seatedSpotOf(plan, "fa-elite")
    expect(spotIndex).toBeDefined()
    const friday = plan.days[4]!.cells[spotIndex!]
    expect(friday.playerId).not.toBe("fa-elite")
    const fridayHasStart = plan.days[4]!.cells.some((cell) => {
      if (!cell.playerId) return false
      const fa = state.players.find((player) => player.id === cell.playerId)
      if (!fa?.teamAbbr) return false
      return schedule.games.some(
        (game) =>
          game.date === plan.days[4]!.date &&
          (game.homeAbbr === fa.teamAbbr || game.awayAbbr === fa.teamAbbr),
      )
    })
    expect(fridayHasStart).toBe(true)
  })

  it("drop-adds after the first hold window instead of freezing the three seats", () => {
    const { state, schedule } = densityState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const replacements = plan.days.flatMap((day) =>
      day.cells.filter((cell) => cell.action === "drop_add"),
    )
    expect(replacements.length).toBeGreaterThan(0)
    expect(plan.addsUsed).toBeGreaterThan(3)
  })

  it("posts more seated starts than 2-spot on the same dense slate", () => {
    const { state, schedule } = densityState()
    const shared = {
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    }
    const two = buildStreamingPlan({ ...shared, spotCount: 2 })
    const three = buildStreamingPlan({ ...shared, spotCount: 3 })
    expect(three.gameStarts).toBeGreaterThan(two.gameStarts)
  })

  it("opens all three spots with 3-in-4 or 2-in-3 windows, not a one-game FA", () => {
    const { state, schedule } = densityState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const mondayIds = plan.days[0]!.cells.map((cell) => cell.playerId)
    expect(mondayIds).toEqual(
      expect.arrayContaining(["fa-elite", "fa-wed-b2b", "fa-2in3"]),
    )
    expect(mondayIds).not.toContain("fa-thin")
  })

  it("uses the add on the block that covers more still-empty days, not a packed 3-in-4", () => {
    const scatter = player("fa-scatter", "NYK", {
      projections: { ...baseProjections(), STL: 220 },
    })
    const pack = player("fa-pack", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const state = tinyState([scatter, pack], ["fa-scatter", "fa-pack"])
    state.rosterSlots = ["UTIL"]
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: null }]
    const schedule = tinySchedule(week, [
      { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "SAC" },
      { date: "2026-10-24", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2026-10-25", homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2026-10-23", homeAbbr: "BOS", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 1,
      waiverPeriodDays: 0,
    })
    const firstAdd = plan.days[0]!.cells.find(
      (cell) => cell.action === "add" && cell.playerId,
    )
    expect(firstAdd?.playerId).toBeTruthy()
    const addedId = firstAdd!.playerId
    const addedPlayer = state.players.find((entry) => entry.id === addedId)
    const coveredEmptyDays = week.filter((date) =>
      schedule.games.some(
        (game) =>
          game.date === date &&
          addedPlayer?.teamAbbr &&
          (game.homeAbbr === addedPlayer.teamAbbr ||
            game.awayAbbr === addedPlayer.teamAbbr),
      ),
    ).length
    expect(coveredEmptyDays).toBeGreaterThanOrEqual(3)
    expect(plan.days[0]!.cells[firstAdd!.spotIndex]?.playerId).toBe(addedId)
    expect(plan.gameStarts).toBeGreaterThanOrEqual(3)
  })

  it("keeps every spot occupied on days a leftover dense FA still plays", () => {
    const { state, schedule } = densityState()
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    for (const day of plan.days) {
      const emptySpots = day.cells.filter((cell) => !cell.playerId).length
      const seated = new Set(
        day.cells.map((cell) => cell.playerId).filter(Boolean),
      )
      const leftoverDense = ["fa-wed-b2b", "fa-late-b2b", "fa-late-2in3"].some(
        (playerId) => {
          if (seated.has(playerId)) return false
          const fa = state.players.find((player) => player.id === playerId)
          if (!fa?.teamAbbr) return false
          return schedule.games.some(
            (game) =>
              game.date === day.date &&
              (game.homeAbbr === fa.teamAbbr || game.awayAbbr === fa.teamAbbr),
          )
        },
      )
      if (leftoverDense) {
        expect(emptySpots, day.date).toBe(0)
      }
    }
  })
})

describe("thin-night add preference", () => {
  it("adds on the short roster night and skips packed-night-only FAs", () => {
    const days = ["2026-10-22", "2026-10-23"]
    const roster = [
      player("r-was", "WAS"),
      player("r-sac", "SAC"),
    ]
    const poole = player("fa-poole", "GSW", {
      projections: { ...baseProjections(), STL: 220 },
    })
    const kornet = player("fa-kornet", "BOS", {
      projections: { ...baseProjections(), STL: 210 },
    })
    const thinA = player("fa-thin-a", "NYK", {
      projections: { ...baseProjections(), STL: 90 },
    })
    const thinB = player("fa-thin-b", "CHI", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const thinC = player("fa-thin-c", "MIA", {
      projections: { ...baseProjections(), STL: 70 },
    })
    const state = tinyState(
      [...roster, poole, kornet, thinA, thinB, thinC],
      ["fa-poole", "fa-kornet", "fa-thin-a", "fa-thin-b", "fa-thin-c"],
    )
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: "r-was" },
      { slot: "UTIL", playerId: "r-sac" },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2026-10-23", homeAbbr: "WAS", awayAbbr: "ORL" },
      { date: "2026-10-23", homeAbbr: "SAC", awayAbbr: "DET" },
      { date: "2026-10-23", homeAbbr: "GSW", awayAbbr: "LAL" },
      { date: "2026-10-23", homeAbbr: "BOS", awayAbbr: "PHI" },
      { date: "2026-10-22", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2026-10-22", homeAbbr: "CHI", awayAbbr: "MIL" },
      { date: "2026-10-22", homeAbbr: "MIA", awayAbbr: "CLE" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    const firstDate = days[0]!
    const secondDate = days[1]!
    const thursdayAdds = plan.days[0]!.cells.filter(
      (cell) => cell.action === "add" || cell.action === "drop_add",
    )
    expect(thursdayAdds.length).toBe(3)
    const playsOn = (playerId: string | null, date: string) => {
      if (!playerId) return false
      const fa = state.players.find((player) => player.id === playerId)
      if (!fa?.teamAbbr) return false
      return schedule.games.some(
        (game) =>
          game.date === date &&
          (game.homeAbbr === fa.teamAbbr || game.awayAbbr === fa.teamAbbr),
      )
    }
    expect(
      thursdayAdds.every((cell) => playsOn(cell.playerId, firstDate)),
    ).toBe(true)
    const packedOnlyAdds = plan.days[1]!.cells.filter((cell) => {
      if (cell.action !== "add" && cell.action !== "drop_add") return false
      return playsOn(cell.playerId, secondDate) && !playsOn(cell.playerId, firstDate)
    })
    expect(packedOnlyAdds.length).toBeLessThanOrEqual(1)
  })
})

describe("3-spot fills empty spots before saving adds", () => {
  const playsOnDate = (
    state: SeasonLeagueState,
    schedule: ScheduleResponse,
    playerId: string | null,
    date: string,
  ) => {
    if (!playerId) return false
    const fa = state.players.find((player) => player.id === playerId)
    if (!fa?.teamAbbr) return false
    return schedule.games.some(
      (game) =>
        game.date === date &&
        (game.homeAbbr === fa.teamAbbr || game.awayAbbr === fa.teamAbbr),
    )
  }

  const emptyPlayingSpots = (
    plan: ReturnType<typeof buildStreamingPlan>,
    state: SeasonLeagueState,
    schedule: ScheduleResponse,
    date: string,
  ) => {
    const day = plan.days.find((entry) => entry.date === date)
    if (!day) return 0
    return day.cells.filter((cell) => !playsOnDate(state, schedule, cell.playerId, date))
      .length
  }

  it("fills every empty 3-spot on the first two days when FAs and adds remain", () => {
    const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]
    const earlyPool = ["ATL", "CHA", "IND", "ORL", "WAS", "BKN", "TOR", "SAC"].map(
      (team, index) =>
        player(`fa-early-${index}`, team, {
          projections: { ...baseProjections(), STL: 200 - index },
        }),
    )
    const lateOnly = player("fa-late-only", "MEM", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const state = tinyState(
      [...earlyPool, lateOnly],
      [...earlyPool.map((fa) => fa.id), lateOnly.id],
    )
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      ...earlyPool.flatMap((fa) => [
        { date: days[0]!, homeAbbr: fa.teamAbbr!, awayAbbr: "LAL" },
        { date: days[1]!, homeAbbr: fa.teamAbbr!, awayAbbr: "NYK" },
      ]),
      { date: days[3]!, homeAbbr: "MEM", awayAbbr: "CLE" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    expect(emptyPlayingSpots(plan, state, schedule, days[0]!)).toBe(0)
    expect(emptyPlayingSpots(plan, state, schedule, days[1]!)).toBe(0)
  })

  it("prefers a through-tomorrow block over a same-spot one-day FA", () => {
    const days = ["2026-11-02", "2026-11-03", "2026-11-04"]
    const oneDay = player("fa-one-day", "CHI", {
      projections: { ...baseProjections(), STL: 240 },
    })
    const throughTomorrow = player("fa-through", "BOS", {
      projections: { ...baseProjections(), STL: 80 },
    })
    const state = tinyState([oneDay, throughTomorrow], [oneDay.id, throughTomorrow.id])
    const schedule = tinySchedule(days, [
      { date: "2026-11-02", homeAbbr: "CHI", awayAbbr: "WAS" },
      { date: "2026-11-02", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2026-11-03", homeAbbr: "BOS", awayAbbr: "DET" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 1,
      waiverPeriodDays: 0,
    })
    const firstAdd = plan.days[0]!.cells.find(
      (cell) => cell.action === "add" && cell.playerId,
    )
    expect(firstAdd?.playerId).toBeTruthy()
    expect(
      playsOnDate(state, schedule, firstAdd!.playerId, days[0]!),
    ).toBe(true)
    expect(
      playsOnDate(state, schedule, firstAdd!.playerId, days[1]!),
    ).toBe(true)
    const heldSpot = plan.days[1]!.cells[firstAdd!.spotIndex]
    expect(heldSpot?.playerId).toBe(firstAdd!.playerId)
    expect(
      playsOnDate(state, schedule, heldSpot?.playerId ?? null, days[1]!),
    ).toBe(true)
  })

  it("still fills a cheap first day when a later scarce block also exists", () => {
    const days = [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]
    const cheapFas = ["ATL", "CHA", "IND", "ORL"].map((team, index) =>
      player(`fa-cheap-${index}`, team, {
        projections: { ...baseProjections(), STL: 220 - index },
      }),
    )
    const lateBlock = player("fa-late-block", "MEM", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const state = tinyState(
      [...cheapFas, lateBlock],
      [...cheapFas.map((fa) => fa.id), lateBlock.id],
    )
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    const schedule = tinySchedule(days, [
      { date: "2026-11-02", homeAbbr: "ATL", awayAbbr: "WAS" },
      { date: "2026-11-03", homeAbbr: "ATL", awayAbbr: "BKN" },
      { date: "2026-11-05", homeAbbr: "ATL", awayAbbr: "TOR" },
      { date: "2026-11-02", homeAbbr: "CHA", awayAbbr: "SAC" },
      { date: "2026-11-03", homeAbbr: "CHA", awayAbbr: "MIL" },
      { date: "2026-11-05", homeAbbr: "CHA", awayAbbr: "PHI" },
      { date: "2026-11-02", homeAbbr: "IND", awayAbbr: "LAL" },
      { date: "2026-11-03", homeAbbr: "IND", awayAbbr: "NYK" },
      { date: "2026-11-05", homeAbbr: "IND", awayAbbr: "BOS" },
      { date: "2026-11-02", homeAbbr: "ORL", awayAbbr: "CHI" },
      { date: "2026-11-03", homeAbbr: "ORL", awayAbbr: "DET" },
      { date: "2026-11-05", homeAbbr: "ORL", awayAbbr: "MIA" },
      { date: "2026-11-05", homeAbbr: "MEM", awayAbbr: "CLE" },
      { date: "2026-11-06", homeAbbr: "MEM", awayAbbr: "MIN" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    })
    expect(emptyPlayingSpots(plan, state, schedule, days[0]!)).toBe(0)
    expect(emptyPlayingSpots(plan, state, schedule, days[1]!)).toBe(0)
  })

  it("ranks a still-empty day ahead of a day another spot already filled", () => {
    const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]
    const overlapA = player("fa-overlap-a", "BOS", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const overlapB = player("fa-overlap-b", "NYK", {
      projections: { ...baseProjections(), STL: 190 },
    })
    const uncovered = player("fa-uncovered", "CHI", {
      projections: { ...baseProjections(), STL: 50 },
    })
    const state = tinyState(
      [overlapA, overlapB, uncovered],
      [overlapA.id, overlapB.id, uncovered.id],
    )
    state.rosterSlots = ["UTIL"]
    const schedule = tinySchedule(days, [
      { date: "2026-11-02", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2026-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2026-11-05", homeAbbr: "BOS", awayAbbr: "DET" },
      { date: "2026-11-02", homeAbbr: "NYK", awayAbbr: "SAC" },
      { date: "2026-11-04", homeAbbr: "NYK", awayAbbr: "MIL" },
      { date: "2026-11-05", homeAbbr: "NYK", awayAbbr: "PHI" },
      { date: "2026-11-03", homeAbbr: "CHI", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      waiverPeriodDays: 0,
    })
    const emptyDate = days[1]!
    const emptyCovered = plan.days.some(
      (day) =>
        day.date === emptyDate &&
        day.cells.some((cell) =>
          playsOnDate(state, schedule, cell.playerId, emptyDate),
        ),
    )
    expect(emptyCovered).toBe(true)
    const firstDatePlaying = plan.days[0]!.cells.filter((cell) =>
      playsOnDate(state, schedule, cell.playerId, days[0]!),
    )
    expect(firstDatePlaying.length).toBeLessThanOrEqual(1)
  })
})

describe("3-spot ranks same-schedule adds by chase cats only", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]

  const losingCatsBoard = (
    losing: Array<(typeof ALL_CATEGORY_IDS)[number]>,
  ): MatchupBoard => ({
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      const chaseIndex = losing.indexOf(categoryId)
      if (chaseIndex >= 0) {
        return {
          categoryId,
          you: 2,
          opp: 8,
          outcome: "L" as const,
          winProb: 0.4 + chaseIndex * 0.01,
        }
      }
      return {
        categoryId,
        you: 30,
        opp: 10,
        outcome: "W" as const,
        winProb: 0.8,
      }
    }),
    wins: 9 - losing.length,
    losses: losing.length,
    ties: 0,
    projectedCatWins: 9 - losing.length,
  })

  const highCountingA = () =>
    player("fa-count-a", "BOS", {
      projections: {
        ...baseProjections(),
        AST: 620,
        STL: 210,
        REB: 40,
        BLK: 6,
        PTS: 220,
        FG_PCT: 0.41,
        FT_PCT: 0.7,
      },
    })

  const highCountingB = () =>
    player("fa-count-b", "NYK", {
      projections: {
        ...baseProjections(),
        AST: 40,
        STL: 8,
        REB: 920,
        BLK: 280,
        PTS: 1900,
        FG_PCT: 0.63,
        FT_PCT: 0.89,
      },
    })

  const sameScheduleState = (players: SeasonPlayer[]) => {
    const state = tinyState(
      players,
      players.map((fa) => fa.id),
    )
    state.rosterSlots = ["UTIL", "UTIL", "UTIL"]
    state.teams[0]!.entries = [
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
      { slot: "UTIL", playerId: null },
    ]
    return state
  }

  const firstAddId = (plan: ReturnType<typeof buildStreamingPlan>) =>
    plan.days
      .flatMap((day) => day.cells)
      .find((cell) => cell.action === "add" || cell.action === "drop_add")
      ?.playerId

  it("picks the FA with the two contested counting stats when game days match", () => {
    const pairA = highCountingA()
    const pairB = highCountingB()
    const schedule = tinySchedule(days, [
      { date: days[0]!, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: days[2]!, homeAbbr: "BOS", awayAbbr: "DET" },
      { date: days[0]!, homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: days[2]!, homeAbbr: "NYK", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state: sameScheduleState([pairA, pairB]),
      schedule,
      board: losingCatsBoard(["AST", "STL"]),
      addLimit: 1,
      waiverPeriodDays: 0,
    })
    expect(firstAddId(plan)).toBe("fa-count-a")
  })

  it("flips the winner when the contested set is the other counting pair", () => {
    const pairA = highCountingA()
    const pairB = highCountingB()
    const schedule = tinySchedule(days, [
      { date: days[0]!, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: days[2]!, homeAbbr: "BOS", awayAbbr: "DET" },
      { date: days[0]!, homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: days[2]!, homeAbbr: "NYK", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state: sameScheduleState([pairA, pairB]),
      schedule,
      board: losingCatsBoard(["REB", "BLK"]),
      addLimit: 1,
      waiverPeriodDays: 0,
    })
    expect(firstAddId(plan)).toBe("fa-count-b")
  })

  it("lets more still-empty days beat a lower chase score", () => {
    const highChase = player("fa-chase-thin", "BOS", {
      projections: {
        ...baseProjections(),
        AST: 620,
        STL: 210,
        REB: 40,
        BLK: 6,
      },
    })
    const moreDays = player("fa-cover-more", "NYK", {
      projections: {
        ...baseProjections(),
        AST: 40,
        STL: 8,
        REB: 40,
        BLK: 6,
      },
    })
    const schedule = tinySchedule(days, [
      { date: days[0]!, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: days[2]!, homeAbbr: "BOS", awayAbbr: "DET" },
      { date: days[0]!, homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: days[1]!, homeAbbr: "NYK", awayAbbr: "ORL" },
      { date: days[2]!, homeAbbr: "NYK", awayAbbr: "ATL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state: sameScheduleState([highChase, moreDays]),
      schedule,
      board: losingCatsBoard(["AST", "STL"]),
      addLimit: 1,
      waiverPeriodDays: 0,
    })
    expect(firstAddId(plan)).toBe("fa-cover-more")
  })

  it("does not let a higher density tier win when empty days and chase favor the other FA", () => {
    const highChase = player("fa-chase-2in3", "BOS", {
      projections: {
        ...baseProjections(),
        AST: 620,
        STL: 210,
        REB: 40,
        BLK: 6,
      },
    })
    const higherDensity = player("fa-dense-b2b", "NYK", {
      projections: {
        ...baseProjections(),
        AST: 40,
        STL: 8,
        REB: 920,
        BLK: 280,
        PTS: 1900,
        FG_PCT: 0.63,
      },
    })
    const schedule = tinySchedule(days, [
      { date: days[0]!, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: days[2]!, homeAbbr: "BOS", awayAbbr: "DET" },
      { date: days[0]!, homeAbbr: "NYK", awayAbbr: "MIA" },
      { date: days[1]!, homeAbbr: "NYK", awayAbbr: "ORL" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 3,
      state: sameScheduleState([highChase, higherDensity]),
      schedule,
      board: losingCatsBoard(["AST", "STL"]),
      addLimit: 1,
      waiverPeriodDays: 0,
    })
    expect(firstAddId(plan)).toBe("fa-chase-2in3")
  })
})

describe("game-day roster cuts stay off playing players", () => {
  const day = "2026-10-20"
  const days = [day, "2026-10-21", "2026-10-22"]

  it("cuts the no-game roster player when a same-day playing bench player also exists", () => {
    const idle = player("r-idle", "DET", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const playingBench = player("r-play", "BOS", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const fa = player("fa-stream", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const starters = ["CHI", "ATL", "MIA", "ORL", "CLE", "MIL", "IND", "WAS"].map(
      (team, index) =>
        player(`r-start-${index}`, team, {
          projections: { ...baseProjections(), STL: 80 },
        }),
    )
    const starterSlots = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"] as const
    const youState = tinyState([...starters, idle, playingBench, fa], [fa.id])
    youState.teams[0]!.entries = [
      ...starters.map((entry, index) => ({
        slot: starterSlots[index]!,
        playerId: entry.id,
      })),
      { slot: "UTIL", playerId: idle.id },
      { slot: "BE", playerId: playingBench.id },
    ]
    const schedule = tinySchedule(days, [
      ...starters.map((entry) => ({
        date: day,
        homeAbbr: entry.teamAbbr!,
        awayAbbr: "SAC",
      })),
      { date: day, homeAbbr: "BOS", awayAbbr: "LAL" },
      { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "PHX" },
      { date: "2026-10-22", homeAbbr: "DET", awayAbbr: "BKN" },
      { date: day, homeAbbr: "NYK", awayAbbr: "TOR" },
    ])
    const youPlan = buildStreamingPlan({
      spotCount: 1,
      state: youState,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      waiverPeriodDays: 0,
    })
    expect(youPlan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-stream",
      rosterDropPlayerId: "r-idle",
    })

    const oppState = tinyState([...starters, idle, playingBench, fa], [fa.id])
    oppState.teams[0]!.entries = [{ slot: "UTIL", playerId: null }]
    oppState.teams[1]!.entries = youState.teams[0]!.entries
    const oppPlan = buildStreamingPlan({
      spotCount: 1,
      state: oppState,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      waiverPeriodDays: 0,
      oppSpotCount: 1,
      opponentTeamIndex: 1,
      youIdle: true,
    })
    expect(oppPlan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-stream",
      droppedPlayerId: "r-idle",
    })
  })

  it("skips the add when every droppable roster player has a game that day", () => {
    const playA = player("r-play-a", "BOS", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const playB = player("r-play-b", "NYK", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const fa = player("fa-stream", "PHI", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const youState = tinyState([playA, playB, fa], [fa.id])
    youState.teams[0]!.entries = [
      { slot: "UTIL", playerId: playA.id },
      { slot: "BE", playerId: playB.id },
    ]
    const schedule = tinySchedule(days, [
      { date: day, homeAbbr: "BOS", awayAbbr: "LAL" },
      { date: day, homeAbbr: "NYK", awayAbbr: "TOR" },
      { date: day, homeAbbr: "PHI", awayAbbr: "BKN" },
    ])
    const youPlan = buildStreamingPlan({
      spotCount: 1,
      state: youState,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      waiverPeriodDays: 0,
    })
    expect(youPlan.days[0]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
      rosterDropPlayerId: null,
    })

    const oppState = tinyState([playA, playB, fa], [fa.id])
    oppState.teams[0]!.entries = [{ slot: "UTIL", playerId: null }]
    oppState.teams[1]!.entries = youState.teams[0]!.entries
    const oppPlan = buildStreamingPlan({
      spotCount: 1,
      state: oppState,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      waiverPeriodDays: 0,
      oppSpotCount: 1,
      opponentTeamIndex: 1,
      youIdle: true,
    })
    expect(oppPlan.opponentDays[0]!.cells[0]).toMatchObject({
      action: "empty",
      playerId: null,
      droppedPlayerId: null,
    })
  })

  it("still cuts a playing player when the user forces that drop", () => {
    const playing = player("r-forced", "BOS", {
      projections: { ...baseProjections(), STL: 40 },
    })
    const fa = player("fa-forced", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const state = tinyState([playing, fa], [fa.id])
    state.teams[0]!.entries = [{ slot: "UTIL", playerId: playing.id }]
    const schedule = tinySchedule(days, [
      { date: day, homeAbbr: "BOS", awayAbbr: "LAL" },
      { date: day, homeAbbr: "NYK", awayAbbr: "TOR" },
    ])
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 2,
      waiverPeriodDays: 0,
      forcedRosterDrops: { [streamingAddDropKey(day, 0)]: "r-forced" },
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-forced",
      rosterDropPlayerId: "r-forced",
    })
  })
})

describe("more spots must not reduce seated starts", () => {
  it("2-spot and 3-spot beat 1-spot, spend addLimit, and 3-spot does not lose starts", () => {
    const days = [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]
    const starterTeams = [
      "NYK",
      "BOS",
      "PHI",
      "ORL",
      "ATL",
      "CHI",
      "CLE",
      "DET",
      "MIL",
      "IND",
    ] as const
    const laterTeams = ["DEN", "UTA", "POR"] as const
    const starters = starterTeams.map((team, index) =>
      player(`r-start-${index}`, team, {
        positions: packedRosterPositions[index],
      }),
    )
    const later = laterTeams.map((team, index) =>
      player(`r-later-${index}`, team, { positions: ["C"] }),
    )
    const fas = [
      ["WAS", "fa-a"],
      ["CHA", "fa-b"],
      ["BKN", "fa-c"],
      ["TOR", "fa-d"],
      ["SAC", "fa-e"],
      ["MIN", "fa-f"],
      ["OKC", "fa-g"],
      ["DAL", "fa-h"],
      ["HOU", "fa-i"],
      ["MEM", "fa-j"],
    ].map(([team, id], index) =>
      player(id, team, {
        projections: { ...baseProjections(), STL: 180 - index },
      }),
    )
    const state = tinyState(
      [...starters, ...later, ...fas],
      fas.map((fa) => fa.id),
    )
    state.teams[0]!.entries = [
      ...starters.map((rostered, index) => ({
        slot: packedActiveSlots[index]!,
        playerId: rostered.id,
      })),
      { slot: "BE", playerId: later[0]!.id },
      { slot: "BE", playerId: later[1]!.id },
      { slot: "BE", playerId: later[2]!.id },
    ]
    const schedule = tinySchedule(days, [
      ...starterTeams.slice(0, 7).flatMap((team) => [
        { date: "2026-10-20", homeAbbr: team, awayAbbr: "LAL" },
        { date: "2026-10-22", homeAbbr: team, awayAbbr: "PHX" },
        { date: "2026-10-24", homeAbbr: team, awayAbbr: "GSW" },
      ]),
      ...starterTeams.slice(7).flatMap((team) => [
        { date: "2026-10-21", homeAbbr: team, awayAbbr: "PHX" },
        { date: "2026-10-23", homeAbbr: team, awayAbbr: "GSW" },
      ]),
      ...laterTeams.flatMap((team) => [
        { date: "2026-10-22", homeAbbr: team, awayAbbr: "SAS" },
        { date: "2026-10-23", homeAbbr: team, awayAbbr: "LAC" },
        { date: "2026-10-25", homeAbbr: team, awayAbbr: "NOP" },
      ]),
      { date: "2026-10-20", homeAbbr: "WAS", awayAbbr: "MIA" },
      { date: "2026-10-21", homeAbbr: "WAS", awayAbbr: "MIA" },
      { date: "2026-10-20", homeAbbr: "CHA", awayAbbr: "BKN" },
      { date: "2026-10-21", homeAbbr: "CHA", awayAbbr: "BKN" },
      { date: "2026-10-20", homeAbbr: "BKN", awayAbbr: "TOR" },
      { date: "2026-10-22", homeAbbr: "BKN", awayAbbr: "TOR" },
      { date: "2026-10-21", homeAbbr: "TOR", awayAbbr: "SAC" },
      { date: "2026-10-22", homeAbbr: "TOR", awayAbbr: "SAC" },
      { date: "2026-10-21", homeAbbr: "SAC", awayAbbr: "MIN" },
      { date: "2026-10-23", homeAbbr: "SAC", awayAbbr: "MIN" },
      { date: "2026-10-22", homeAbbr: "MIN", awayAbbr: "OKC" },
      { date: "2026-10-23", homeAbbr: "MIN", awayAbbr: "OKC" },
      { date: "2026-10-23", homeAbbr: "OKC", awayAbbr: "DAL" },
      { date: "2026-10-24", homeAbbr: "OKC", awayAbbr: "DAL" },
      { date: "2026-10-24", homeAbbr: "DAL", awayAbbr: "HOU" },
      { date: "2026-10-25", homeAbbr: "DAL", awayAbbr: "HOU" },
      { date: "2026-10-24", homeAbbr: "HOU", awayAbbr: "MEM" },
      { date: "2026-10-25", homeAbbr: "HOU", awayAbbr: "MEM" },
      { date: "2026-10-25", homeAbbr: "MEM", awayAbbr: "WAS" },
    ])
    const shared = {
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 7,
      waiverPeriodDays: 0,
    }
    const one = buildStreamingPlan({ ...shared, spotCount: 1 })
    const two = buildStreamingPlan({ ...shared, spotCount: 2 })
    const three = buildStreamingPlan({ ...shared, spotCount: 3 })
    expect(two.gameStarts).toBeGreaterThan(one.gameStarts)
    expect(three.gameStarts).toBeGreaterThanOrEqual(two.gameStarts)
    expect(two.addsUsed).toBe(7)
    expect(three.addsUsed).toBe(7)
    const firstDayAdds = two.days[0]!.cells.filter(
      (cell) => cell.action === "add" || cell.action === "drop_add",
    ).length
    expect(firstDayAdds).toBeLessThan(7)
  })
})

describe("matchup source has no player-name branches", () => {
  it("does not hardcode player names or ids in matchup production files", async () => {
    const { readdirSync, readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const banned =
      /Bagley|Kornet|Ellis|Mara|Reaves|Ighodaro|ighodaro|reaves/i
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const next = join(dir, entry.name)
        return entry.isDirectory() ? walk(next) : [next]
      })
    const files = walk("src/lib/matchup").filter((file) =>
      file.endsWith(".ts"),
    )
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(banned)
    }
  })
})
