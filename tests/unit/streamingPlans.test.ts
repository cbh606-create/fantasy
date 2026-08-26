import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"
import {
  buildAllStreamingPlans,
  buildStreamingPlan,
  streamingAddDropKey,
} from "@/lib/matchup/streamingPlans"
import {
  softCapForSpot,
  suggestStreamingStrategyMode,
} from "@/lib/matchup/streamingStrategy"
import type { MatchupBoard, StreamingPlanDayCell } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const assertCellShape = (cell: StreamingPlanDayCell) => cell

describe("WEEKLY_ADD_LIMIT", () => {
  it("is 7 ESPN-style weekly acquisitions", () => {
    expect(WEEKLY_ADD_LIMIT).toBe(7)
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
    strategyMode: "aggressive",
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
    winProb: categoryId === "STL" ? 0.2 : 0.8,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
})

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
      strategyMode: "aggressive",
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

  it("1-spot covers off night instead of holding a multi-game streamer", () => {
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
      strategyMode: "aggressive",
    })

    expect(plan.addsUsed).toBeLessThanOrEqual(7)
    expect(plan.addLimit).toBe(7)
    expect(plan.addsUsed).toBe(3)
    expect(plan.days[0]!.cells[0]).toMatchObject({ action: "add", playerId: "fa-a" })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-b",
      droppedPlayerId: "fa-a",
    })
    expect(plan.days[2]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-a",
      droppedPlayerId: "fa-b",
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

    const plan = buildStreamingPlan({ spotCount: 1, state, schedule, board })

    expect(plan.days[0]!.cells[0]!.action).toBe("add")
    expect(plan.days[1]!.cells[0]).toMatchObject({ action: "hold", playerId: "fa-a" })
    expect(plan.addsUsed).toBe(1)
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
      strategyMode: "aggressive",
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
      strategyMode: "aggressive",
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
      strategyMode: "aggressive",
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      rosterDropKind: "open_slot",
      rosterDropPlayerId: null,
    })
  })

  it("picks roster drop by no-game then volume then weak-cat; no same-day reuse", () => {
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
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
    })
    const drops = plan.days[0]!.cells.map((c) => c.rosterDropPlayerId)
    expect(drops[0]).toBe("you-idle")
    expect(drops[1]).toBe("you-play")
    expect(new Set(drops).size).toBe(2)
    expect(plan.days[0]!.cells.every((c) => c.rosterDropKind === "player")).toBe(
      true,
    )
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
      strategyMode: "aggressive",
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
    expect(Math.max(...addsBySpot)).toBeLessThanOrEqual(
      softCapForSpot(7, 2, "aggressive"),
    )
    // Soft cap + fill-least-used keeps spots from hogging; hold-through can leave
    // a 2-add gap when one dense streamer covers most of the week.
    expect(Math.abs(addsBySpot[0]! - addsBySpot[1]!)).toBeLessThanOrEqual(
      Math.ceil(7 / 2),
    )
  })
  it("holds a streamer through off nights when they still have games left", () => {
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
      // Tue off for BOS — must hold, not churn to a one-night streamer
      { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "ATL" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      addLimit: 4,
      strategyMode: "aggressive",
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-dense",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-dense",
    })
    expect(plan.days[2]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-dense",
    })
    expect(plan.addsUsed).toBe(1)
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
      addLimit: 4,
    })

    expect(plan.days[0]!.cells[0]!.playerId).toBe("fa-dense")
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

describe("strategy-aware streaming plans", () => {
  it("Conservative skips thin one-game streams when a denser block exists later", () => {
    const days = [
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
    ]
    // Thin FA plays only Mon; elite FA plays Wed/Thu/Fri
    const thin = player("fa-thin", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 100 },
    })
    const state = tinyState([thin, elite], ["fa-thin", "fa-elite"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-07", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const board = emptyBoardLosingStl()

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "conservative",
    })

    expect(plan.strategyMode).toBe("conservative")
    expect(plan.days[0]!.cells[0]!.action).toBe("empty")
    const eliteAdd = plan.days.find((d) =>
      d.cells.some((c) => c.playerId === "fa-elite" && c.action === "add"),
    )
    expect(eliteAdd?.date).toBe("2025-11-05")
  })

  it("Aggressive can add thin on day 1", () => {
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
      strategyMode: "aggressive",
    })
    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-thin",
    })
  })

  it("omitted strategyMode uses board suggestion", () => {
    const days = ["2025-11-03"]
    const fa = player("fa-a", "BOS")
    const state = tinyState([fa], ["fa-a"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
    ])
    const board = emptyBoardLosingStl() // 1 L of 9 → conservative
    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
    })
    expect(plan.suggestedStrategyMode).toBe(
      suggestStreamingStrategyMode(board),
    )
    expect(plan.strategyMode).toBe(plan.suggestedStrategyMode)
    expect(plan.summaryReasons.length).toBeGreaterThan(0)
  })

  it("Aggressive early-swaps into a much denser block; Conservative does not", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
    const held = player("fa-held", "NYK", {
      projections: { ...baseProjections(), STL: 200 },
    })
    const elite = player("fa-elite", "BOS", {
      projections: { ...baseProjections(), STL: 50 },
    })
    // On-game Tue: held plays Mon+Tue+Wed (strong remaining window), elite
    // starts a denser Tue–Thu block. Off-night net-starts does not apply;
    // allowsEarlySwap (delta 1) still distinguishes Aggressive vs Conservative.
    const state = tinyState([held, elite], ["fa-held", "fa-elite"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "DET" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "ORL" },
    ])
    const board = emptyBoardLosingStl()

    const aggressive = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "aggressive",
      addLimit: 7,
    })
    const conservative = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board,
      strategyMode: "conservative",
      addLimit: 7,
    })

    expect(aggressive.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-elite",
      droppedPlayerId: "fa-held",
    })
    expect(conservative.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-held",
    })
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
      strategyMode: "balanced",
    })

    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
    expect(plan.gameStarts).toBeGreaterThanOrEqual(2)
    expect(plan.addsUsed).toBeLessThanOrEqual(plan.addLimit)
    expect(plan.summaryReasons).toContain("Maximizing starts within add budget")
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
      strategyMode: "balanced",
    })

    expect(plan.addsUsed).toBe(4)
    expect(plan.addsUsed).toBeLessThanOrEqual(plan.addLimit)
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
      strategyMode: "aggressive",
    })

    const addsByDay = plan.days.map((day) =>
      day.cells.filter(
        (cell) => cell.action === "add" || cell.action === "drop_add",
      ).length,
    )
    const earlyAdds = addsByDay.slice(0, 3).reduce((sum, n) => sum + n, 0)
    const lateAdds = addsByDay.slice(4).reduce((sum, n) => sum + n, 0)

    // Empty fills are unpaced (2 on day 0 OK); swap churn stays paced.
    expect(addsByDay[0]).toBeGreaterThanOrEqual(2)
    expect(earlyAdds).toBeLessThan(7)
    expect(plan.addsUsed).toBeLessThanOrEqual(7)
    expect(earlyAdds).toBeLessThan(plan.addsUsed)
    expect(lateAdds + addsByDay[3]!).toBeGreaterThan(0)
  })

  it("2-spot fills both empty seats on day 1 even when daily swap pace is 1", () => {
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
      strategyMode: "aggressive",
    })
    expect(plan.days[0]!.cells.every((c) => c.action === "add")).toBe(true)
    expect(plan.addsUsed).toBe(2)
  })

  it("does not roster-drop a healthy low-ADP player on first add", () => {
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
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      adpByPlayerId: { star: 25, scrub: 200 },
    })

    expect(plan.days[0]!.cells[0]!.action).toBe("add")
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).not.toBe("star")
    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("scrub")
    expect(plan.summaryReasons).toContain("Protected ADP ≤ 60")
  })

  it("may roster-drop a low-ADP player when marked long-term out", () => {
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
      { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
    ])

    const plan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: emptyBoardLosingStl(),
      strategyMode: "aggressive",
      adpByPlayerId: { star: 25, scrub: 200 },
      injuryOutDaysByPlayerId: { star: 21 },
    })

    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("star")
    expect(plan.days[0]!.cells[0]!.rosterDropKind).toBe("player")
  })

  it("prefers IL vs new-injured comparison when both exist", () => {
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
      strategyMode: "aggressive",
      adpByPlayerId: { "il-guy": 80, star: 20 },
      injuryOutDaysByPlayerId: { "il-guy": 30, star: 21 },
    })

    expect(plan.days[0]!.cells[0]!.rosterDropPlayerId).toBe("il-guy")
    expect(plan.days[0]!.cells[0]!.rosterDropKind).toBe("player")
  })
})

describe("forcedRosterDrops", () => {
  const rosterDropFixture = () => {
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
    const board = emptyBoardLosingStl()
    const baseInput = {
      spotCount: 2 as const,
      state,
      schedule,
      board,
      strategyMode: "aggressive" as const,
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
    expect(drops[1]).toBe("you-play")
  })

  it("passes forcedRosterDrops through buildAllStreamingPlans", () => {
    const { baseInput, date } = rosterDropFixture()
    const forceKey = streamingAddDropKey(date, 0)
    const plans = buildAllStreamingPlans({
      state: baseInput.state,
      schedule: baseInput.schedule,
      board: baseInput.board,
      strategyMode: baseInput.strategyMode,
      forcedRosterDrops: { [forceKey]: "you-play" },
    })

    expect(plans[1]!.days[0]!.cells[0]!.rosterDropPlayerId).toBe("you-play")
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
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "DET" },
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
      strategyMode: "aggressive",
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
      action: "add",
      rosterDropPlayerId: "you-bench",
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
      strategyMode: "aggressive",
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
      addIndex: 2,
    })
  })

  it("covers off night even when upgrade has fewer remaining games", () => {
    const days = ["2025-11-03", "2025-11-04", "2025-11-05", "2025-11-06"]
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
      strategyMode: "aggressive",
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-chi",
      droppedPlayerId: "fa-bos",
    })
  })

  it("lists next-best streamers as alternativePlayerIds on add cells", () => {
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
      strategyMode: "aggressive",
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
      strategyMode: "aggressive",
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]?.playerId).toBe("fa-big")
    expect(plan.days[0]!.cells[0]!.alternativePlayerIds).not.toContain(
      "fa-guard",
    )
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
      strategyMode: "aggressive",
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
      strategyMode: "conservative",
      addLimit: 7,
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "hold",
      playerId: "fa-bos",
    })
  })

  it("uses pickBestFa fallback when pickTodayBlock is gated on mid-week off night", () => {
    // Conservative skips thin until last 3 days. 7-day week, Tue = dayIndex 1.
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
      strategyMode: "conservative",
      addLimit: 7,
    })

    expect(plan.days[0]!.cells[0]).toMatchObject({
      action: "add",
      playerId: "fa-bos",
    })
    expect(plan.days[1]!.cells[0]).toMatchObject({
      action: "drop_add",
      playerId: "fa-chi",
      droppedPlayerId: "fa-bos",
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

  it("holds 2-spot mid-block off night when only thin FA plays today", () => {
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
      strategyMode: "aggressive",
      addLimit: 7,
    })
    // Spot that holds BOS through Tue must stay hold (thin CHI only; Tue is not last 3)
    const tueBos = plan.days[1]!.cells.find((c) => c.playerId === "fa-bos")
    expect(tueBos?.action).toBe("hold")
  })

  it("drop_adds on 2-spot late-week off night when only thin FA plays today", () => {
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
      strategyMode: "aggressive",
      addLimit: 7,
    })
    // Fill-before-swap: exhausted ATL spot takes thin CHI; BOS holds off night.
    expect(
      plan.days[1]!.cells.find((c) => c.playerId === "fa-bos")?.action,
    ).toBe("hold")
    expect(
      plan.days[1]!.cells.find((c) => c.playerId === "fa-chi"),
    ).toMatchObject({
      action: "drop_add",
      droppedPlayerId: "fa-atl",
    })
  })

  it("prefers filling an empty 2-spot over off-night swap when ok+ block starts", () => {
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
      strategyMode: "aggressive",
      addLimit: 7,
    })
    const tue = plan.days[1]!.cells.find(
      (c) => c.action === "drop_add" && c.playerId === "fa-nyk",
    )
    expect(tue).toBeTruthy()
    expect(tue?.droppedPlayerId).toBe("fa-atl")
    expect(
      plan.days[1]!.cells.find((c) => c.playerId === "fa-bos")?.action,
    ).toBe("hold")
  })

  it("late-week off-night swaps held streamer when both spots are occupied", () => {
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
      strategyMode: "aggressive",
      addLimit: 7,
    })
    const tue = plan.days[1]!.cells.find((c) => c.droppedPlayerId === "fa-bos")
    expect(tue).toMatchObject({
      action: "drop_add",
      playerId: "fa-chi",
    })
  })
})
