// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WaiversWorkspace } from "@/components/waivers/WaiversWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { SeasonLeagueState } from "@/lib/season/types"

const mockSearchParams = vi.hoisted(() => ({
  get: (_key: string) => null as string | null,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}))

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
      id: "you-1",
      name: "Your Starter",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "fa-1",
      name: "Free Agent Guard",
      availability: "fa",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "nickeil-alexander-walker",
      name: "Nickeil Alexander-Walker",
      availability: "fa",
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
        { slot: "PG", playerId: "you-1" },
        { slot: "SG", playerId: null },
      ],
    },
    {
      teamIndex: 1,
      name: "Rivals",
      entries: [{ slot: "C", playerId: null }],
    },
  ],
  availablePlayerIds: ["fa-1"],
  waiverOrder: [0, 1],
  source: "manual",
}

const poolResponse = {
  available: [
    {
      id: "fa-1",
      name: "Free Agent Guard",
      teamAbbr: "LAL",
      availability: "fa" as const,
    },
    {
      id: "nickeil-alexander-walker",
      name: "Nickeil Alexander-Walker",
      teamAbbr: "ATL",
      availability: "fa" as const,
    },
  ],
  waiverOrder: [0, 1],
  youWaiverRank: 1,
  youNeeds: ["AST", "STL"],
  recommendations: [
    {
      playerId: "fa-1",
      score: 2.4,
      reasons: ["Helps AST, STL"],
    },
  ],
  playersById: {
    "fa-1": state.players[1],
  },
  state,
}

const previewResponse = {
  youWaiverRank: 1,
  requiresAssumeSuccess: false,
  before: { needsScore: 1 },
  after: { needsScore: 3 },
  overall: {
    rankBefore: 4,
    rankAfter: 2,
    rankSumBefore: 50,
    rankSumAfter: 41,
  },
  categoryDeltas: [{
    categoryId: "AST" as const,
    rankBefore: 10,
    rankAfter: 7,
    beforeTotal: 12,
    afterTotal: 18,
  }],
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
      urgency: "league" as const,
      score: 100,
      reasons: ["ATL depth #1 behind Trae Young (OUT)"],
    },
  ],
  source: { depth: "fixture" as const, injuries: "fixture" as const },
}

describe("WaiversWorkspace", () => {
  beforeEach(() => {
    mockSearchParams.get = () => null
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/waivers/pool?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(poolResponse), { status: 200 })
      }

      if (url === "/api/injuries/breakouts?seasonLeagueId=season-1") {
        return new Response(
          JSON.stringify({
            source: "espn",
            recommendations: [
              {
                playerId: "fa-1",
                reasons: ["rates", "lineup"],
                evidence: {
                  games: 3,
                  baselineMinutes: 28,
                  seasonMinutes: 36,
                  baseline: "prior",
                  zHeld: false,
                  attempts: "down",
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (url === "/api/injuries/pickups?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(injuryPickupsResponse), { status: 200 })
      }

      if (url === "/api/waivers/preview" && method === "POST") {
        return new Response(JSON.stringify(previewResponse), { status: 200 })
      }

      return new Response("missing", { status: 404 })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows recommendations, selects an add, and renders preview deltas", async () => {
    render(<WaiversWorkspace leagueId="season-1" />)

    const recommendationsHeading = await screen.findByRole("heading", {
      name: "Season needs",
    })
    expect(recommendationsHeading).toBeInTheDocument()

    const recommendation = screen.getByRole("button", {
      name: "Add Free Agent Guard",
    })
    fireEvent.click(recommendation)
    expect(recommendation).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "Preview impact" }))

    await waitFor(() => {
      expect(screen.getByText("12.0 → 18.0")).toBeInTheDocument()
    })

    expect(
      within(screen.getByRole("heading", { name: "Category changes" }).closest("div")!)
        .getByText("#10 → #7"),
    ).toBeInTheDocument()
  })

  it("selects a pickup in the builder and shows the strength nonagon after a drop", async () => {
    render(<WaiversWorkspace leagueId="season-1" />)

    await screen.findByRole("heading", { name: "Season needs" })

    const pickup = screen.getByLabelText("Pickup")
    expect(pickup).toHaveTextContent("Select a pickup")
    expect(screen.getByLabelText("Drop (optional)")).toBeDisabled()

    fireEvent.click(pickup)
    const teams = screen.getByRole("menu", { name: "Teams" })
    expect(within(teams).getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual([
      "ATL›",
      "LAL›",
    ])
    expect(screen.queryByRole("menuitem", { name: "Free Agent Guard" })).not.toBeInTheDocument()

    fireEvent.mouseEnter(within(teams).getByRole("menuitem", { name: "LAL" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Free Agent Guard" }))

    expect(
      screen.queryByRole("table", { name: "Available players, grouped by team" }),
    ).not.toBeInTheDocument()

    expect(screen.getByRole("heading", { name: "Free Agent Guard" })).toBeInTheDocument()
    expect(screen.getByLabelText("Drop (optional)")).toBeEnabled()
    expect(screen.getByRole("button", { name: "Add Free Agent Guard" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    fireEvent.change(screen.getByLabelText("Drop (optional)"), {
      target: { value: "you-1" },
    })

    expect(await screen.findByRole("heading", { name: "Team strength" })).toBeInTheDocument()
    expect(screen.getByText("Overall #4 → #2 (rank sum 50 → 41)")).toBeInTheDocument()
    expect(screen.getAllByText("#10 → #7").length).toBeGreaterThan(0)
    expect(screen.getByText("12.0 → 18.0")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("radio", { name: "Per game" }))

    await waitFor(() => {
      const previewCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => {
        const url = String(input)
        return (init?.method ?? "GET") === "POST" && url === "/api/waivers/preview"
      })
      const lastBody = JSON.parse(String(previewCalls.at(-1)?.[1]?.body)) as { basis?: string }

      expect(lastBody.basis).toBe("perGame")
    })
  })

  it("pre-selects add player from addPlayerId query param", async () => {
    mockSearchParams.get = (key) => (key === "addPlayerId" ? "fa-1" : null)

    render(<WaiversWorkspace leagueId="season-1" />)

    await screen.findByRole("heading", { name: "Season needs" })

    expect(
      screen.getByRole("button", { name: "Add Free Agent Guard" }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("prefills builder from an injury pickup recommendation", async () => {
    render(<WaiversWorkspace leagueId="season-1" />)

    await screen.findByRole("heading", { name: "Injury pickups" })

    await waitFor(() => {
      const injuryGets = vi.mocked(fetch).mock.calls.filter(([input, init]) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        return method === "GET" && url.includes("/api/injuries/pickups")
      })

      expect(injuryGets[0]?.[0]).toBe(
        "/api/injuries/pickups?seasonLeagueId=season-1",
      )
    })

    const nawButton = await screen.findByRole("button", {
      name: "Add Nickeil Alexander-Walker",
    })
    fireEvent.click(nawButton)

    expect(nawButton).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("heading", { name: "Nickeil Alexander-Walker" }),
    ).toBeInTheDocument()
  })

  it("shows empty copy when there are no injury pickups", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/waivers/pool?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(poolResponse), { status: 200 })
      }

      if (url === "/api/injuries/breakouts?seasonLeagueId=season-1") {
        return new Response(
          JSON.stringify({
            source: "espn",
            recommendations: [{ playerId: "fa-1", reasons: ["rates", "lineup"] }],
          }),
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

      if (url === "/api/waivers/preview" && method === "POST") {
        return new Response(JSON.stringify(previewResponse), { status: 200 })
      }

      return new Response("missing", { status: 404 })
    }))

    render(<WaiversWorkspace leagueId="season-1" />)

    expect(
      await screen.findByText("No injury-driven pickups right now."),
    ).toBeInTheDocument()
  })

  it("selects a breakout and keeps the other recommendation lists", async () => {
    render(<WaiversWorkspace leagueId="season-1" />)

    const breakouts = await screen.findByRole("heading", { name: "Breakouts" })
    const injury = await screen.findByRole("heading", { name: "Injury pickups" })
    const needs = await screen.findByRole("heading", { name: "Season needs" })

    expect(breakouts.compareDocumentPosition(injury) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(injury.compareDocumentPosition(needs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Matchup stream" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Available pool" })).not.toBeInTheDocument()

    expect(screen.getAllByRole("heading", { name: "Injury pickups" })).toHaveLength(1)
    expect(screen.getAllByRole("heading", { name: "Season needs" })).toHaveLength(1)

    const button = screen.getByRole("button", {
      name: "Add Free Agent Guard, rates, lineup, 28.0 → 36.0 mpg · 3 GP · z down · FGA down",
    })
    expect(screen.getByText("28.0 → 36.0 mpg · 3 GP · z down · FGA down")).toBeInTheDocument()
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Add Free Agent Guard" })).toBeInTheDocument()
  })

  it("shows breakouts error without hiding other recommendation lists", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/waivers/pool?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(poolResponse), { status: 200 })
      }

      if (url === "/api/injuries/breakouts?seasonLeagueId=season-1") {
        return new Response("error", { status: 500 })
      }

      if (url === "/api/injuries/pickups?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(injuryPickupsResponse), { status: 200 })
      }

      if (url === "/api/waivers/preview" && method === "POST") {
        return new Response(JSON.stringify(previewResponse), { status: 200 })
      }

      return new Response("missing", { status: 404 })
    }))

    render(<WaiversWorkspace leagueId="season-1" />)

    expect(await screen.findByText("Unable to load breakouts")).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Injury pickups" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Season needs" })).toBeInTheDocument()
  })
})
