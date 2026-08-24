import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"
import { buildAllStreamingPlans, buildStreamingPlan } from "@/lib/matchup/streamingPlans"
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
  })
  expect(cell.rosterDropKind).toBe("open_slot")
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

  it("1-spot prefers holding a multi-game streamer over nightly churn", () => {
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
    // Mon Add A (also plays Wed) → hold Tue off-night → hold Wed. One add only.
    expect(plan.addsUsed).toBe(1)
    expect(plan.days[0]!.cells[0]).toMatchObject({ action: "add", playerId: "fa-a" })
    expect(plan.days[1]!.cells[0]).toMatchObject({ action: "hold", playerId: "fa-a" })
    expect(plan.days[2]!.cells[0]).toMatchObject({ action: "hold", playerId: "fa-a" })
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
    // held: Mon+Wed+Thu so Conservative will add the elite Mon block, then
    // hold Tue (remaining > 0). elite: Tue Wed Thu starts a denser window.
    const state = tinyState([held, elite], ["fa-held", "fa-elite"])
    const schedule = tinySchedule(days, [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "WAS" },
      { date: "2025-11-06", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-06", homeAbbr: "NYK", awayAbbr: "DET" },
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
