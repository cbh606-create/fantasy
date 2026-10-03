// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DealDetail } from "@/components/trade/DealDetail"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { SeasonLeagueState } from "@/lib/season/types"
import type { TradeSuggestion } from "@/lib/trade/types"

const baseProjections = {
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

const shooting = { FGM: 5, FGA: 10, FTM: 4, FTA: 5 }

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
      projections: { ...baseProjections, PTS: 30, AST: 9, REB: 9 },
      shooting,
    },
    {
      id: "get-1",
      name: "Their Center",
      projections: baseProjections,
      shooting,
    },
    {
      id: "filler",
      name: "Filler",
      projections: { ...baseProjections, PTS: 8, AST: 1, REB: 2 },
      shooting,
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
        { slot: "SF", playerId: "filler" },
      ],
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
}

const suggestion: TradeSuggestion = {
  id: "1:1|1|give-1|get-1",
  shape: "1:1",
  counterpartyTeamIndex: 1,
  givePlayerIds: ["give-1"],
  getPlayerIds: ["get-1"],
  reasons: ["Gains REB"],
  mutualScore: 2,
  valueGap: 0.08,
  youGains: [{ categoryId: "AST", before: 10, after: 7 }],
  youImproved: [],
  themGains: [{ categoryId: "REB", before: 40, after: 55 }],
  youWorsened: [],
  themWorsened: [{ categoryId: "STL", before: 8, after: 6 }],
  youStrengthsHeld: [],
  themStrengthsHeld: ["AST"],
}

describe("DealDetail", () => {
  afterEach(cleanup)

  it("explains what the counterparty gets and what it costs them", () => {
    render(<DealDetail state={state} suggestion={suggestion} />)

    expect(screen.getByRole("heading", { name: "What they get" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What you get" })).toBeInTheDocument()
    expect(screen.getByText("REB")).toBeInTheDocument()
    expect(screen.getByText("40.0 → 55.0")).toBeInTheDocument()
    expect(screen.getByText("Stays strong in AST")).toBeInTheDocument()
    expect(screen.getByText("Your package is larger by 8%")).toBeInTheDocument()
    expect(screen.getByText(/STL was already below average/)).toBeInTheDocument()
  })

  it("omits the worsened block when neither side worsens", () => {
    render(
      <DealDetail
        state={state}
        suggestion={{ ...suggestion, themWorsened: [], youWorsened: [] }}
      />,
    )

    expect(screen.queryByText(/was already below average/)).toBeNull()
  })
})
