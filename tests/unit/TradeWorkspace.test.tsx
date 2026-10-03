// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TradeWorkspace } from "@/components/trade/TradeWorkspace"
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
      id: "give-1",
      name: "Your Guard",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "get-1",
      name: "Their Center",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "get-2",
      name: "Their Wing",
      projections,
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
  ],
  teams: [
    {
      teamIndex: 0,
      name: "My Team",
      entries: [{ slot: "PG", playerId: "give-1" }],
    },
    {
      teamIndex: 1,
      name: "Rivals",
      entries: [
        { slot: "C", playerId: "get-1" },
        { slot: "SF", playerId: "get-2" },
      ],
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
}

const suggestions = [
  {
    id: "1:1|1|give-1|get-1",
    shape: "1:1" as const,
    counterpartyTeamIndex: 1,
    givePlayerIds: ["give-1"],
    getPlayerIds: ["get-1"],
    reasons: ["Gains 3PM"],
    mutualScore: 2.4,
    youGains: [{ categoryId: "AST" as const, before: 10, after: 7 }],
    youImproved: [{ categoryId: "TPM" as const, before: 5, after: 8 }],
    themGains: [{ categoryId: "REB" as const, before: 8, after: 6 }],
    youWorsened: [],
    themWorsened: [],
    youStrengthsHeld: ["PTS" as const],
    themStrengthsHeld: [],
  },
  {
    id: "1:1|1|give-1|get-2",
    shape: "1:1" as const,
    counterpartyTeamIndex: 1,
    givePlayerIds: ["give-1"],
    getPlayerIds: ["get-2"],
    reasons: ["Gains PTS"],
    mutualScore: 1.8,
    youGains: [{ categoryId: "STL" as const, before: 9, after: 6 }],
    youImproved: [],
    themGains: [{ categoryId: "PTS" as const, before: 7, after: 5 }],
    youWorsened: [],
    themWorsened: [],
    youStrengthsHeld: ["PTS" as const],
    themStrengthsHeld: [],
  },
]

const previewUrl = "/api/trade/suggestions?seasonLeagueId=season-1"
const generateUrl = "/api/trade/suggestions?seasonLeagueId=season-1&categories=TPM&excludedPlayerIds="
const excludedUrl = "/api/trade/suggestions?seasonLeagueId=season-1&categories=TPM&excludedPlayerIds=give-1"
const generatedBody = {
  suggestions,
  youWeak: ["AST", "TPM"],
  youStrong: ["PTS"],
  analysisPerspectiveTeamIndex: 0,
  state,
}

describe("TradeWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input)

      if (url === previewUrl) {
        return new Response(JSON.stringify({
          ...generatedBody,
          suggestions: [],
        }), { status: 200 })
      }

      if (url === generateUrl || url === excludedUrl) {
        return new Response(JSON.stringify(generatedBody), { status: 200 })
      }

      return new Response("missing", { status: 404 })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("generates after a category is selected and keeps the list until the next click", async () => {
    render(<TradeWorkspace leagueId="season-1" />)

    expect(await screen.findByText(
      "Select a category, then generate trade suggestions.",
    )).toBeInTheDocument()
    const weakSection = screen.getByRole("heading", { name: "Weak categories" }).closest("section")!
    expect(within(weakSection).getByText("3PM")).toBeInTheDocument()
    expect(within(weakSection).queryByText("TPM")).toBeNull()

    const generate = screen.getByRole("button", { name: "Generate trade suggestions" })
    expect(generate).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "3PM" }))
    expect(generate).toBeEnabled()
    fireEvent.click(generate)

    expect(await screen.findByRole("button", {
      name: /trade your guard for their center/i,
    })).toBeInTheDocument()
    expect(screen.getByText("Gains 3PM")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Their Center" })).toBeInTheDocument()
    expect(screen.getByText("5.0 → 8.0")).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContain(generateUrl)

    fireEvent.click(screen.getByRole("button", {
      name: /trade your guard for their wing/i,
    }))
    expect(screen.getByRole("heading", { name: "Their Wing" })).toBeInTheDocument()

    const callsBefore = vi.mocked(fetch).mock.calls.length
    fireEvent.click(screen.getByRole("button", { name: "AST" }))
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore)
  })

  it("sends Do Not Include ids on the next generate", async () => {
    render(<TradeWorkspace leagueId="season-1" />)
    await screen.findByText("Select a category, then generate trade suggestions.")

    fireEvent.click(screen.getByRole("button", { name: "3PM" }))
    fireEvent.click(screen.getByRole("button", { name: "Do Not Include" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate trade suggestions" }))

    await screen.findByRole("heading", { name: "Their Center" })
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContain(
      "/api/trade/suggestions?seasonLeagueId=season-1&categories=TPM&excludedPlayerIds=give-1",
    )
  })

  it("keeps the current list when generate fails", async () => {
    render(<TradeWorkspace leagueId="season-1" />)
    await screen.findByText("Select a category, then generate trade suggestions.")
    fireEvent.click(screen.getByRole("button", { name: "3PM" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate trade suggestions" }))
    expect(await screen.findByRole("heading", { name: "Their Center" })).toBeInTheDocument()

    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 500 }))
    fireEvent.click(screen.getByRole("button", { name: "Generate trade suggestions" }))

    expect(await screen.findByText("Unable to load trade suggestions")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Their Center" })).toBeInTheDocument()
  })
})
