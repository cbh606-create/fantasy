// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MatchupWorkspace } from "@/components/matchup/MatchupWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { MatchupAdvice } from "@/lib/matchup/types"
import type { SeasonLeagueState } from "@/lib/season/types"

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
      entries: [{ slot: "C", playerId: null }],
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
}

const matchupAdvice: MatchupAdvice & {
  playersById: Record<string, (typeof state.players)[number]>
  teams: { teamIndex: number; name: string }[]
} = {
  opponentTeamIndex: 1,
  scoringPeriod: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-09",
    days: ["2025-11-03", "2025-11-05"],
  },
  board: {
    categories: [
      {
        categoryId: "PTS",
        you: 120,
        opp: 100,
        outcome: "W",
        winProb: 0.72,
      },
    ],
    wins: 5,
    losses: 3,
    ties: 1,
    projectedCatWins: 5.2,
  },
  sitStart: [
    {
      benchPlayerId: "bench-1",
      activePlayerId: "active-1",
      deltaProjectedCatWins: 0.42,
      reason: "+0.42 cat wins · 3 games",
    },
  ],
  streamers: [],
  playersById: {
    "bench-1": state.players[0],
    "active-1": state.players[1],
  },
  teams: [
    { teamIndex: 0, name: "My Team" },
    { teamIndex: 1, name: "Rivals" },
  ],
}

describe("MatchupWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/season-leagues/season-1") {
        return new Response(JSON.stringify({ state }), { status: 200 })
      }

      if (
        url.startsWith("/api/matchup?seasonLeagueId=season-1&opponentTeamIndex=1")
      ) {
        return new Response(JSON.stringify(matchupAdvice), { status: 200 })
      }

      if (url === "/api/matchup/apply-lineup" && method === "POST") {
        return new Response(JSON.stringify({ ok: true, entries: [] }), {
          status: 200,
        })
      }

      return new Response("missing", { status: 404 })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it("renders board summary and sit/start recommendations", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)

    expect(
      await screen.findByRole("heading", { name: "Test league" }),
    ).toBeInTheDocument()

    expect(screen.getByText("YOU 5 — Opp 3 — Tie 1")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Sit / Start" })).toBeInTheDocument()
    expect(screen.getByText("+0.42 cat wins · 3 games")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Start Bench Star over Cold Starter",
      }),
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/matchup/apply-lineup",
        expect.objectContaining({ method: "POST" }),
      )
    })
  })
})
