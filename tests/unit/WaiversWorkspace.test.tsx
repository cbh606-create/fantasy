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
}

const previewResponse = {
  youWaiverRank: 1,
  requiresAssumeSuccess: false,
  before: { needsScore: 1 },
  after: { needsScore: 3 },
  categoryDeltas: [{ categoryId: "AST" as const, rankBefore: 10, rankAfter: 7 }],
}

describe("WaiversWorkspace", () => {
  beforeEach(() => {
    mockSearchParams.get = () => null
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/season-leagues/season-1") {
        return new Response(JSON.stringify({ state }), { status: 200 })
      }

      if (url === "/api/waivers/pool?seasonLeagueId=season-1") {
        return new Response(JSON.stringify(poolResponse), { status: 200 })
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
      name: "Recommended pickups",
    })
    expect(recommendationsHeading).toBeInTheDocument()

    const recommendation = screen.getByRole("button", {
      name: /add free agent guard/i,
    })
    fireEvent.click(recommendation)
    expect(recommendation).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "Preview impact" }))

    await waitFor(() => {
      expect(screen.getByText("10 → 7")).toBeInTheDocument()
    })

    expect(
      within(screen.getByRole("heading", { name: "Category rank changes" }).closest("div")!)
        .getByText("AST"),
    ).toBeInTheDocument()
  })

  it("pre-selects add player from addPlayerId query param", async () => {
    mockSearchParams.get = (key) => (key === "addPlayerId" ? "fa-1" : null)

    render(<WaiversWorkspace leagueId="season-1" />)

    await screen.findByRole("heading", { name: "Recommended pickups" })

    expect(
      screen.getByRole("button", { name: /add free agent guard/i }),
    ).toHaveAttribute("aria-pressed", "true")
  })
})
