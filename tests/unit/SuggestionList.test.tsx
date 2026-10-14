// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SuggestionList } from "@/components/trade/SuggestionList"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { SeasonLeagueState } from "@/lib/season/types"
import type { TradeSuggestion } from "@/lib/trade/types"

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

const shooting = { FGM: 5, FGA: 10, FTM: 4, FTA: 5 }

const buildState = (count: number): SeasonLeagueState => ({
  id: "season-1",
  name: "Test league",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  players: [
    { id: "give-1", name: "Your Guard", projections, shooting },
    ...Array.from({ length: count }, (_, index) => ({
      id: `get-${index}`,
      name: `Get ${index}`,
      projections,
      shooting,
    })),
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
      entries: Array.from({ length: count }, (_, index) => ({
        slot: "C",
        playerId: `get-${index}`,
      })),
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
})

const buildSuggestions = (count: number): TradeSuggestion[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `offer-${index}`,
    shape: "1:1" as const,
    counterpartyTeamIndex: 1,
    givePlayerIds: ["give-1"],
    getPlayerIds: [`get-${index}`],
    reasons: ["Gains REB"],
    mutualScore: 1,
    youGains: [],
    youImproved: [],
    themGains: [],
    youWorsened: [],
    themWorsened: [],
    youStrengthsHeld: [],
    themStrengthsHeld: [],
  }))

describe("SuggestionList", () => {
  afterEach(cleanup)

  it("shows 20 rows and reveals the rest on request", () => {
    render(
      <SuggestionList
        onSelect={vi.fn()}
        selectedId="offer-0"
        state={buildState(40)}
        suggestions={buildSuggestions(40)}
      />,
    )

    expect(screen.getAllByRole("button", { name: /trade/i })).toHaveLength(20)
    expect(screen.getAllByText("0.000").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "Show 20 more" }))

    expect(screen.getByRole("button", { name: /for get 39$/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Show 20 more" })).toBeNull()
  })

  it("names the remaining count and does not select when paging", () => {
    const onSelect = vi.fn()

    render(
      <SuggestionList
        onSelect={onSelect}
        selectedId="offer-0"
        state={buildState(25)}
        suggestions={buildSuggestions(25)}
      />,
    )

    const showMore = screen.getByRole("button", { name: "Show 5 more" })
    fireEvent.click(showMore)

    expect(screen.queryByRole("button", { name: "Show 5 more" })).toBeNull()
    expect(screen.getAllByRole("button", { name: /trade/i })).toHaveLength(25)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("keeps the selected detail beside the deal list", () => {
    render(
      <SuggestionList
        onSelect={vi.fn()}
        selectedDetail={<p>Deal detail body</p>}
        selectedId="offer-0"
        state={buildState(2)}
        suggestions={buildSuggestions(2)}
      />,
    )

    expect(screen.getByRole("list", { name: "Trade suggestions" })).not.toHaveTextContent(
      "Deal detail body",
    )
    expect(screen.getByText("Deal detail body")).toBeInTheDocument()
  })

  it("filters the list to one opponent team", () => {
    const state = buildState(2)
    state.teams.push({ teamIndex: 2, name: "Other", entries: [] })
    const suggestions = buildSuggestions(2)
    suggestions[1] = { ...suggestions[1], counterpartyTeamIndex: 2 }
    const onSelect = vi.fn()

    render(
      <SuggestionList
        onSelect={onSelect}
        selectedId="offer-0"
        state={state}
        suggestions={suggestions}
      />,
    )

    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "2" } })

    expect(screen.queryByRole("button", { name: /for get 0$/i })).toBeNull()
    expect(screen.getByRole("button", { name: /for get 1$/i })).toBeInTheDocument()
    expect(onSelect).toHaveBeenCalledWith("offer-1")
  })
})
