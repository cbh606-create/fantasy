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
    reasons: ["Gains REB"],
    mutualScore: 2.4,
    youGains: [{ categoryId: "AST" as const, before: 10, after: 7 }],
    youImproved: [],
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

describe("TradeWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input)

      if (url === "/api/trade/suggestions?seasonLeagueId=season-1") {
        return new Response(JSON.stringify({
          suggestions,
          youWeak: ["AST", "STL"],
          youStrong: ["PTS"],
          analysisPerspectiveTeamIndex: 0,
          state,
        }), { status: 200 })
      }

      return new Response("missing", { status: 404 })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows weak categories and updates deal detail when a suggestion is selected", async () => {
    render(<TradeWorkspace leagueId="season-1" />)

    const weakCategoriesHeading = await screen.findByRole("heading", {
      name: "Weak categories",
    })
    expect(weakCategoriesHeading).toBeInTheDocument()
    const weakSection = weakCategoriesHeading.closest("section")!
    expect(within(weakSection).getByText("AST")).toBeInTheDocument()
    expect(within(weakSection).getByText("Below average")).toBeInTheDocument()
    expect(within(weakSection).getByText("Above average")).toBeInTheDocument()

    const secondSuggestion = screen.getByRole("button", {
      name: /trade your guard for their wing/i,
    })
    fireEvent.click(secondSuggestion)

    expect(screen.getByRole("heading", { name: "Their Wing" })).toBeInTheDocument()
    expect(screen.getByText("Packages are even")).toBeInTheDocument()
    expect(screen.queryByText("9 → 6")).toBeNull()
    expect(secondSuggestion).toHaveAttribute("aria-pressed", "true")
  })
})
