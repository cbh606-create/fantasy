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

const scoringDays = ["2025-11-03", "2025-11-05"] as const

const matchupAdvice: MatchupAdvice & {
  schedule: {
    source: "fixture"
    matchup: {
      scoringPeriodId: number
      startDate: string
      endDate: string
      days: string[]
    }
    games: { date: string; homeAbbr: string; awayAbbr: string }[]
  }
  playersById: Record<string, (typeof state.players)[number]>
  teams: { teamIndex: number; name: string }[]
} = {
  opponentTeamIndex: 1,
  scoringPeriod: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-09",
    days: [...scoringDays],
  },
  schedule: {
    source: "fixture",
    matchup: {
      scoringPeriodId: 1,
      startDate: "2025-11-03",
      endDate: "2025-11-09",
      days: [...scoringDays],
    },
    games: [
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "BOS" },
      { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "MIA" },
    ],
  },
  board: {
    categories: [
      "FG_PCT",
      "FT_PCT",
      "TPM",
      "REB",
      "AST",
      "STL",
      "BLK",
      "TO",
      "PTS",
    ].map((categoryId) => ({
      categoryId: categoryId as MatchupAdvice["board"]["categories"][number]["categoryId"],
      you: 10,
      opp: 8,
      outcome: "W" as const,
      winProb: 0.6,
    })),
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

const injuryPickupsResponse = {
  events: [
    {
      playerId: "trae-young",
      teamAbbr: "ATL",
      status: "out" as const,
      note: "Right knee",
    },
  ],
  recommendations: [
    {
      injuredPlayerId: "trae-young",
      injuredPlayerName: "Trae Young",
      addPlayerId: "nickeil-alexander-walker",
      addPlayerName: "Nickeil Alexander-Walker",
      teamAbbr: "ATL",
      status: "out" as const,
      depthRank: 1,
      urgency: "roster" as const,
      score: 100,
      reasons: [
        "ATL depth #1 behind Trae Young (OUT)",
        "On your roster — replace minutes",
      ],
    },
  ],
  source: { depth: "fixture" as const, injuries: "fixture" as const },
}

describe("MatchupWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/season-leagues/season-1") {
        return new Response(JSON.stringify({ state }), { status: 200 })
      }

      if (url.startsWith("/api/matchup?") && !url.includes("apply-lineup")) {
        return new Response(
          JSON.stringify({ ...matchupAdvice, state }),
          { status: 200 },
        )
      }

      if (url === "/api/injuries/pickups?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(injuryPickupsResponse), {
          status: 200,
        })
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

  it("renders live board, daily lineup, and sit/start recommendations", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)

    expect(
      await screen.findByRole("heading", { name: "Test league" }),
    ).toBeInTheDocument()

    expect(screen.getByText("Using your day-by-day lineups")).toBeInTheDocument()
    expect(screen.getByLabelText("Matchup board")).toHaveTextContent(/YOU \d+/)
    expect(screen.getByRole("heading", { name: "Daily lineup" })).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: /Sit Cold Starter on/i }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole("button", { name: /Start Bench Star on/i }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(
        "Incomplete lineup — fill active slots for a fair projection",
      ),
    ).toBeInTheDocument()
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

  it("updates the live board when a player is sat on a game day", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)

    expect(
      await screen.findByRole("heading", { name: "Daily lineup" }),
    ).toBeInTheDocument()

    const boardBefore = screen.getByLabelText("Matchup board").textContent
    const sitButtons = screen.getAllByRole("button", {
      name: /Sit Cold Starter on/i,
    })

    fireEvent.click(sitButtons[0])

    await waitFor(() => {
      expect(screen.getByLabelText("Matchup board").textContent).not.toEqual(
        boardBefore,
      )
    })
  })

  it("links injury alert CTA to waivers with addPlayerId", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)

    const cta = await screen.findByRole("link", {
      name: /Nickeil Alexander-Walker/i,
    })

    expect(cta.getAttribute("href")).toContain(
      "addPlayerId=nickeil-alexander-walker",
    )
  })

  it("hides injury alerts when there are no recommendations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/api/matchup?") && !url.includes("apply-lineup")) {
        return new Response(
          JSON.stringify({ ...matchupAdvice, state }),
          { status: 200 },
        )
      }

      if (url === "/api/injuries/pickups?seasonLeagueId=season-1") {
        return new Response(
          JSON.stringify({
            events: [],
            recommendations: [],
            source: { depth: "fixture", injuries: "fixture" },
          }),
          { status: 200 },
        )
      }

      if (url === "/api/matchup/apply-lineup" && method === "POST") {
        return new Response(JSON.stringify({ ok: true, entries: [] }), {
          status: 200,
        })
      }

      return new Response("missing", { status: 404 })
    }))

    render(<MatchupWorkspace leagueId="season-1" />)

    expect(
      await screen.findByRole("heading", { name: "Streamers" }),
    ).toBeInTheDocument()

    await waitFor(() => {
      const injuryGets = vi.mocked(fetch).mock.calls.filter(([request]) =>
        String(request).includes("/api/injuries/pickups"),
      )
      expect(injuryGets.length).toBeGreaterThan(0)
    })

    expect(
      screen.queryByRole("heading", { name: "Injury alerts" }),
    ).not.toBeInTheDocument()
  })
})
