// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeasonRosterWorkspace } from "@/components/season/SeasonRosterWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"

const categories = {
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

const slots = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL", "BE", "BE", "BE", "IL"] as const

const state: SeasonLeagueState = {
  id: "season-1",
  name: "Test roster",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  players: slots.map((_, index) => ({
    id: `player-${index}`,
    name: `Player ${index + 1}`,
    projections: { ...categories, AST: categories.AST + index },
    shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
  })),
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: slots.map((slot, index) => ({ slot, playerId: `player-${index}` })),
    },
    {
      teamIndex: 1,
      name: "Opponent",
      entries: slots.map((slot, index) => ({ slot, playerId: `player-${index}` })),
    },
  ],
  source: "manual",
}

describe("SeasonRosterWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders every roster slot and persists an edited lineup", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state, analysis: analyzeSeasonLeague(state) }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state, analysis: analyzeSeasonLeague(state) }),
      } as Response)

    render(<SeasonRosterWorkspace leagueId="season-1" />)

    expect(await screen.findByRole("heading", { name: "Test roster" })).toBeInTheDocument()
    expect(screen.getAllByText("Player 1")).not.toHaveLength(0)
    expect(screen.getByRole("button", { name: "Edit lineup" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reset matrix order" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edit lineup" }))
    fireEvent.click(screen.getByRole("button", { name: "Save lineup" }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/season-leagues/season-1/lineup",
      expect.objectContaining({ method: "PATCH" }),
    )
  })
})
