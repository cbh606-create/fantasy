// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MatchupWorkspace } from "@/components/matchup/MatchupWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { MatchupAdvice } from "@/lib/matchup/types"
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
    {
      id: "other-1",
      name: "Other Forward",
      teamAbbr: "MIA",
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
      entries: [
        { slot: "C", playerId: "opp-big" },
        { slot: "UTIL", playerId: null },
      ],
    },
    {
      teamIndex: 2,
      name: "Other Club",
      entries: [{ slot: "PF", playerId: "other-1" }],
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
}

const scoringDays = ["2025-11-03", "2025-11-05"] as const

const matchupAdvice: MatchupAdvice & {
  schedule: {
    source: "live" | "season" | "fixture"
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
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "MIA" },
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
  streamingPlans: [],
  playersById: {
    "bench-1": state.players[0],
    "active-1": state.players[1],
    "opp-big": state.players[2],
    "other-1": state.players[3],
  },
  teams: [
    { teamIndex: 0, name: "My Team" },
    { teamIndex: 1, name: "Rivals" },
    { teamIndex: 2, name: "Other Club" },
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
    expect(screen.getByText("Schedule: fixture fallback")).toBeInTheDocument()
    const dailyHeading = screen.getByRole("heading", { name: "Daily lineup" })
    const oppWeek = screen.getByLabelText("Opponent week")
    expect(oppWeek).toBeInTheDocument()
    expect(
      dailyHeading.compareDocumentPosition(oppWeek) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByLabelText("Matchup plans")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "You none" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: /Auto · 1 open/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: "Opp 3-spot" }))
    expect(screen.getByRole("button", { name: "Opp 3-spot" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByLabelText("Matchup board")).toHaveTextContent(/8–1–0/)
    expect(screen.getByLabelText("Matchup board")).toHaveTextContent(/Proj 6\.64/)
    expect(screen.getByRole("rowheader", { name: /^You$/i })).toBeInTheDocument()
    expect(
      screen.getAllByRole("rowheader", { name: /^Opp$/i }).length,
    ).toBeGreaterThan(0)
    expect(dailyHeading).toBeInTheDocument()
    expect(
      screen.getByTitle("B2B · ~75% expected"),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: /Sit Cold Starter on/i }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole("button", { name: /Sit Bench Star on/i }).length,
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

  it("resets Opp drop to Auto when the opponent team changes", async () => {
    render(<MatchupWorkspace leagueId="season-1" />)

    const firstDrop = await screen.findByLabelText("Opp drop spot 1")
    fireEvent.change(firstDrop, { target: { value: "opp-big" } })
    expect(firstDrop).toHaveValue("opp-big")

    fireEvent.click(screen.getByRole("button", { name: "Opp 3-spot" }))
    expect(screen.getByLabelText("Opp drop spot 1")).toBeInTheDocument()
    expect(screen.getByLabelText("Opp drop spot 2")).toBeInTheDocument()
    expect(screen.getByLabelText("Opp drop spot 3")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Matchup opponent"), {
      target: { value: "2" },
    })

    await waitFor(() => {
      expect(screen.getByLabelText("Opp drop spot 1")).toHaveValue("")
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
      await screen.findByRole("heading", { name: /streaming plans/i }),
    ).toBeInTheDocument()

    const dailySection = screen.getByRole("region", { name: "Daily lineup" })
    const streamingSection = screen
      .getByRole("heading", { name: /streaming plans/i })
      .closest("section")
    const grid = dailySection.parentElement?.parentElement
    expect(grid).toHaveClass(
      "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]",
    )
    expect(streamingSection?.parentElement).toBe(grid)
    expect(dailySection).toContainElement(
      screen.getByLabelText("Opponent week"),
    )

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

  it("labels the schedule chip for published season fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/api/matchup?") && !url.includes("apply-lineup")) {
        return new Response(
          JSON.stringify({
            ...matchupAdvice,
            state,
            schedule: { ...matchupAdvice.schedule, source: "season" },
          }),
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

    render(<MatchupWorkspace leagueId="season-1" />)

    expect(
      await screen.findByText("Schedule: published · next week with games"),
    ).toBeInTheDocument()
  })

  it("lets you start a roster player again after sitting them during a 1-spot preview", async () => {
    const days = ["2025-10-22", "2025-10-23"]
    const packedSlots = [
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
    ] as const
    const packedTeams = [
      "NYK",
      "LAL",
      "BOS",
      "CHI",
      "MIA",
      "ATL",
      "DEN",
      "GSW",
      "MIL",
      "PHX",
    ] as const
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
    const rosterPlayers = packedTeams.map((team, index) => ({
      id: index === 1 ? "reaves" : `r${index}`,
      name: index === 1 ? "Austin Reaves" : `Roster ${index}`,
      teamAbbr: team,
      positions: [...packedPositions[index]!],
      projections: { ...projections, BLK: 30 },
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    }))
    const streamer = {
      id: "fa-tor",
      name: "Streamer Tor",
      teamAbbr: "TOR",
      positions: ["SG" as const, "SF" as const],
      availability: "fa" as const,
      projections: { ...projections, BLK: 400, STL: 180 },
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    }
    const packedState: SeasonLeagueState = {
      ...state,
      players: [...rosterPlayers, streamer],
      availablePlayerIds: ["fa-tor"],
      teams: [
        {
          teamIndex: 0,
          name: "My Team",
          entries: packedSlots.map((slot, index) => ({
            slot,
            playerId: rosterPlayers[index]!.id,
          })),
        },
        {
          teamIndex: 1,
          name: "Rivals",
          entries: [{ slot: "C", playerId: null }],
        },
      ],
    }
    const packedAdvice = {
      ...matchupAdvice,
      scoringPeriod: {
        ...matchupAdvice.scoringPeriod,
        startDate: days[0]!,
        endDate: days[1]!,
        days,
      },
      schedule: {
        ...matchupAdvice.schedule,
        matchup: {
          ...matchupAdvice.schedule.matchup,
          startDate: days[0]!,
          endDate: days[1]!,
          days,
        },
        games: [
          { date: "2025-10-22", homeAbbr: "LAL", awayAbbr: "CHI" },
          { date: "2025-10-22", homeAbbr: "NYK", awayAbbr: "BOS" },
          { date: "2025-10-22", homeAbbr: "MIA", awayAbbr: "ATL" },
          { date: "2025-10-22", homeAbbr: "DEN", awayAbbr: "GSW" },
          { date: "2025-10-22", homeAbbr: "TOR", awayAbbr: "ORL" },
          { date: "2025-10-23", homeAbbr: "LAL", awayAbbr: "MIA" },
          { date: "2025-10-23", homeAbbr: "NYK", awayAbbr: "ATL" },
          { date: "2025-10-23", homeAbbr: "BOS", awayAbbr: "CHI" },
          { date: "2025-10-23", homeAbbr: "DEN", awayAbbr: "PHX" },
          { date: "2025-10-23", homeAbbr: "GSW", awayAbbr: "MIL" },
          { date: "2025-10-23", homeAbbr: "TOR", awayAbbr: "WAS" },
        ],
      },
      sitStart: [],
      streamers: [],
      streamingPlans: [],
      playersById: Object.fromEntries(
        [...rosterPlayers, streamer].map((player) => [player.id, player]),
      ),
    }

    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/api/matchup?") && !url.includes("apply-lineup")) {
        return new Response(
          JSON.stringify({ ...packedAdvice, state: packedState }),
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
      await screen.findByRole("heading", { name: "Daily lineup" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "You 1-spot" }))
    expect(
      (await screen.findAllByText(/Previewing 1-spot/i)).length,
    ).toBeGreaterThan(0)

    const sitButtons = screen.getAllByRole("button", {
      name: /Sit Austin Reaves on/i,
    })
    expect(sitButtons.length).toBeGreaterThan(1)
    fireEvent.click(sitButtons[1]!)

    const startButtons = await screen.findAllByRole("button", {
      name: /Start Austin Reaves on/i,
    })
    expect(startButtons.length).toBeGreaterThan(0)
    fireEvent.click(startButtons[startButtons.length - 1]!)

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /Sit Austin Reaves on/i }).length,
      ).toBeGreaterThan(1)
    })
  })
})
