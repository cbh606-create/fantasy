import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"
import { buildAllStreamingPlans, buildStreamingPlan } from "@/lib/matchup/streamingPlans"
import type { MatchupBoard } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

describe("WEEKLY_ADD_LIMIT", () => {
  it("is 7 ESPN-style weekly acquisitions", () => {
    expect(WEEKLY_ADD_LIMIT).toBe(7)
  })
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
  it("1-spot never exceeds add limit and charges 1 add for drop then add", () => {
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
    // Mon Add A, Tue Drop→Add B (1 add), Wed Drop→Add A (1 add) → addsUsed === 3
    expect(plan.addsUsed).toBe(3)
    expect(plan.days[0]!.cells[0]).toMatchObject({ action: "add", playerId: "fa-a" })
    expect(plan.days[1]!.cells[0]!.action).toBe("drop_add")
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

    const plan = buildStreamingPlan({ spotCount: 2, state, schedule, board })
    const day0 = plan.days[0]!.cells
    expect(day0).toHaveLength(2)
    expect(new Set(day0.map((c) => c.playerId)).size).toBe(2)
    expect(plan.addsUsed).toBeGreaterThanOrEqual(2)
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
