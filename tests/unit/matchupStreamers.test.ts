import { describe, expect, it } from "vitest"
import { adviseMatchup } from "@/lib/matchup/advise"
import { suggestStreamers } from "@/lib/matchup/streamers"
import { suggestStreamingStrategyMode } from "@/lib/matchup/streamingStrategy"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-09",
    days: ["2025-11-03", "2025-11-04", "2025-11-05"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
  ],
}

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

const youActive: SeasonPlayer = {
  id: "you-active",
  name: "You Active",
  teamAbbr: "BOS",
  projections: { ...baseProjections(), STL: 20 },
  shooting: { FGM: 500, FGA: 1040, FTM: 200, FTA: 260 },
}

const oppActive: SeasonPlayer = {
  id: "opp-active",
  name: "Opp Active",
  teamAbbr: "NYK",
  projections: { ...baseProjections(), STL: 120 },
  shooting: { FGM: 520, FGA: 1080, FTM: 210, FTA: 270 },
}

const benchStar: SeasonPlayer = {
  id: "bench-star",
  name: "Bench Star",
  teamAbbr: "BOS",
  projections: { ...baseProjections(), STL: 40, PTS: 2000 },
  shooting: { FGM: 700, FGA: 1400, FTM: 300, FTA: 360 },
}

const coldStarter: SeasonPlayer = {
  id: "cold-starter",
  name: "Cold Starter",
  teamAbbr: "BOS",
  projections: { ...baseProjections(), STL: 5, PTS: 400 },
  shooting: { FGM: 150, FGA: 375, FTM: 50, FTA: 70 },
}

const stlSpecialist: SeasonPlayer = {
  id: "stl-specialist",
  name: "STL Specialist",
  teamAbbr: "BOS",
  availability: "fa",
  projections: { ...baseProjections(), STL: 180, PTS: 900 },
  shooting: { FGM: 300, FGA: 650, FTM: 120, FTA: 150 },
}

const zeroGameScrub: SeasonPlayer = {
  id: "zero-game-scrub",
  name: "Zero Game Scrub",
  availability: "waiver",
  projections: { ...baseProjections(), STL: 200, PTS: 950 },
  shooting: { FGM: 320, FGA: 680, FTM: 130, FTA: 160 },
}

const state: SeasonLeagueState = {
  name: "Tiny League",
  season: 2025,
  categories: ALL_CATEGORY_IDS.map((id) => ({ id, enabled: true, weight: 1 })),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "UTIL", playerId: "cold-starter" },
        { slot: "BE", playerId: "bench-star" },
      ],
    },
    {
      teamIndex: 1,
      name: "Them",
      entries: [{ slot: "UTIL", playerId: "opp-active" }],
    },
  ],
  players: [youActive, oppActive, benchStar, coldStarter, stlSpecialist, zeroGameScrub],
  availablePlayerIds: ["stl-specialist", "zero-game-scrub"],
  waiverOrder: [0, 1],
  source: "manual",
}

const boardWithStlLoss = (): MatchupBoard => ({
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

describe("suggestStreamers", () => {
  it("ranks multi-game STL specialist above zero-game scrub when STL is L", () => {
    const gamesMap = new Map<string, number>([
      ["stl-specialist", 3],
      ["zero-game-scrub", 0],
    ])

    const suggestions = suggestStreamers({
      state,
      board: boardWithStlLoss(),
      gamesMap,
    })

    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0]?.playerId).toBe("stl-specialist")
    expect(suggestions[0]?.gamesThisWeek).toBe(3)
    expect(suggestions[0]?.b2bNights).toBe(0)
    expect(suggestions[0]?.reasons[0]).toMatch(/Helps STL · 3 games/)
    expect(suggestions[0]?.score).toBeGreaterThan(0)
  })

  it("labels integer games with a B2B note when present", () => {
    const gamesMap = new Map<string, number>([["stl-specialist", 3]])
    const b2bMap = new Map<string, number>([["stl-specialist", 1]])

    const suggestions = suggestStreamers({
      state,
      board: boardWithStlLoss(),
      gamesMap,
      b2bMap,
    })

    expect(suggestions[0]?.reasons[0]).toBe("Helps STL · 3 games · 1 B2B")
  })
})

describe("adviseMatchup", () => {
  it("rejects opponent === perspective", () => {
    expect(adviseMatchup(state, schedule, state.perspectiveTeamIndex)).toEqual({
      error: "invalid_opponent",
    })
  })

  it("rejects out-of-range opponent", () => {
    expect(adviseMatchup(state, schedule, 99)).toEqual({
      error: "invalid_opponent",
    })
  })

  it("returns board sitStart streamers for valid opponent", () => {
    const advice = adviseMatchup(state, schedule, 1)

    expect(advice).not.toHaveProperty("error")
    if ("error" in advice) return

    expect(advice.opponentTeamIndex).toBe(1)
    expect(advice.scoringPeriod).toEqual(schedule.matchup)
    expect(advice).toHaveProperty("board")
    expect(advice).toHaveProperty("sitStart")
    expect(advice).toHaveProperty("streamers")
    expect(Array.isArray(advice.board.categories)).toBe(true)
    expect(Array.isArray(advice.sitStart)).toBe(true)
    expect(Array.isArray(advice.streamers)).toBe(true)
    expect(advice.streamingPlans).toHaveLength(3)
    expect(advice.streamingPlans.map((p) => p.spotCount)).toEqual([1, 2, 3])
  })

  it("omitted strategyMode uses board suggestion", () => {
    const advice = adviseMatchup(state, schedule, 1)

    expect(advice).not.toHaveProperty("error")
    if ("error" in advice) return

    const suggested = suggestStreamingStrategyMode(advice.board)
    for (const plan of advice.streamingPlans) {
      expect(plan.suggestedStrategyMode).toBe(suggested)
      expect(plan.strategyMode).toBe(plan.suggestedStrategyMode)
      expect(plan.summaryReasons.length).toBeGreaterThan(0)
    }
  })

  it("passes addLimit through to streaming plans", () => {
    const advice = adviseMatchup(state, schedule, 1, { addLimit: 2 })

    expect(advice).not.toHaveProperty("error")
    if ("error" in advice) return

    for (const plan of advice.streamingPlans) {
      expect(plan.addLimit).toBe(2)
    }
  })

  it("includes adpByPlayerId for proj-pool id and name|team matches", () => {
    const wemby: SeasonPlayer = {
      id: "espn-5104157",
      name: "Victor Wembanyama",
      teamAbbr: "SAS",
      projections: baseProjections(),
      shooting: { FGM: 500, FGA: 1040, FTM: 200, FTA: 260 },
    }
    const jokicAlias: SeasonPlayer = {
      id: "custom-jokic",
      name: "Nikola Jokic",
      teamAbbr: "DEN",
      projections: baseProjections(),
      shooting: { FGM: 500, FGA: 1040, FTM: 200, FTA: 260 },
    }
    const advice = adviseMatchup(
      { ...state, players: [...state.players, wemby, jokicAlias] },
      schedule,
      1,
    )

    expect(advice).not.toHaveProperty("error")
    if ("error" in advice) return

    expect(advice.adpByPlayerId?.["espn-5104157"]).toBe(1)
    expect(advice.adpByPlayerId?.["custom-jokic"]).toBe(2)
  })
})
