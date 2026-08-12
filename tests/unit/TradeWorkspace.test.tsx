// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TradeWorkspace } from "@/components/trade/TradeWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
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
    reasons: ["Targets your need: AST"],
    mutualScore: 2.4,
    you: {
      needsScoreBefore: 1,
      needsScoreAfter: 3,
      categoryDeltas: [{ categoryId: "AST" as const, rankBefore: 10, rankAfter: 7 }],
    },
    them: {
      needsScoreBefore: 2,
      needsScoreAfter: 2.4,
      categoryDeltas: [{ categoryId: "REB" as const, rankBefore: 8, rankAfter: 6 }],
    },
  },
  {
    id: "1:1|1|give-1|get-2",
    shape: "1:1" as const,
    counterpartyTeamIndex: 1,
    givePlayerIds: ["give-1"],
    getPlayerIds: ["get-2"],
    reasons: ["Targets your need: STL"],
    mutualScore: 1.8,
    you: {
      needsScoreBefore: 1,
      needsScoreAfter: 2,
      categoryDeltas: [{ categoryId: "STL" as const, rankBefore: 9, rankAfter: 6 }],
    },
    them: {
      needsScoreBefore: 2,
      needsScoreAfter: 2.2,
      categoryDeltas: [{ categoryId: "PTS" as const, rankBefore: 7, rankAfter: 5 }],
    },
  },
]

describe("TradeWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input)

      if (url === "/api/trade/suggestions?seasonLeagueId=season-1") {
        return new Response(JSON.stringify({
          suggestions,
          youNeeds: ["AST", "STL"],
          youSurplus: ["PTS"],
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
    expect(within(weakCategoriesHeading.closest("section")!).getByText("AST"))
      .toBeInTheDocument()

    const secondSuggestion = screen.getByRole("button", {
      name: /trade your guard for their wing/i,
    })
    fireEvent.click(secondSuggestion)

    expect(screen.getByRole("heading", { name: "Their Wing" })).toBeInTheDocument()
    expect(screen.getByText("9 → 6")).toBeInTheDocument()
    expect(secondSuggestion).toHaveAttribute("aria-pressed", "true")
  })
})
