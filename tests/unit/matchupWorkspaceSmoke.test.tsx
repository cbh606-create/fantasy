// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MatchupWorkspace } from "@/components/matchup/MatchupWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { SeasonLeagueState } from "@/lib/season/types"

vi.mock("@/components/season/useSyncActiveSeasonLeague", () => ({
  useSyncActiveSeasonLeague: vi.fn(),
}))

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
}

const state: SeasonLeagueState = {
  id: "season-1",
  name: "Test league",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  players: [
    {
      id: "bench-1",
      name: "Bench Star",
      teamAbbr: "BOS",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "active-1",
      name: "Cold Starter",
      teamAbbr: "NYK",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "opp-big",
      name: "Opp Big",
      teamAbbr: "ATL",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
  ],
  teams: [
    {
      teamIndex: 0,
      name: "My Team",
      entries: [
        { slot: "PG", playerId: "active-1" },
        { slot: "SG", playerId: null },
        { slot: "BE", playerId: "bench-1" },
      ],
    },
    {
      teamIndex: 1,
      name: "Rivals",
      entries: [{ slot: "C", playerId: "opp-big" }],
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
}

const matchupPayload = {
  opponentTeamIndex: 1,
  scoringPeriod: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-09",
    days: ["2025-11-03", "2025-11-05"],
  },
  schedule: {
    source: "fixture" as const,
    matchup: {
      scoringPeriodId: 1,
      startDate: "2025-11-03",
      endDate: "2025-11-09",
      days: ["2025-11-03", "2025-11-05"],
    },
    games: [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "BOS" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "MIA" },
    ],
  },
  board: {
    categories: [
      {
        categoryId: "PTS" as const,
        you: 10,
        opp: 8,
        outcome: "W" as const,
        winProb: 0.6,
      },
    ],
    wins: 1,
    losses: 0,
    ties: 0,
    projectedCatWins: 1,
  },
  sitStart: [],
  streamers: [],
  streamingPlans: [],
  playersById: {
    "bench-1": state.players[0],
    "active-1": state.players[1],
    "opp-big": state.players[2],
  },
  teams: [
    { teamIndex: 0, name: "My Team" },
    { teamIndex: 1, name: "Rivals" },
  ],
  state,
}

describe("MatchupWorkspace smoke", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.startsWith("/api/matchup?")) {
          return new Response(JSON.stringify(matchupPayload), { status: 200 })
        }
        if (url.startsWith("/api/injuries/")) {
          return new Response(
            JSON.stringify({
              events: [],
              recommendations: [],
              source: { depth: "fixture", injuries: "fixture" },
            }),
            { status: 200 },
          )
        }
        return new Response("missing", { status: 404 })
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it("boots with ESPN-style auto opponent and new roster days", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)
    expect(
      await screen.findByRole("heading", { name: "Test league" }),
    ).toBeInTheDocument()
    const stored = window.localStorage.getItem("matchup-opponent:season-1")
    expect(stored).toContain('"teamIndex":1')
    expect(stored).toContain('"matchupStartDate":"2025-11-03"')
  })
})
