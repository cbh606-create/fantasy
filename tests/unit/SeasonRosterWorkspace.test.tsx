// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeasonRosterWorkspace } from "@/components/season/SeasonRosterWorkspace"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"

vi.mock("@/components/season/useSyncActiveSeasonLeague", () => ({
  useSyncActiveSeasonLeague: vi.fn(),
}))

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
    teamAbbr: index === 0 ? "BOS" : undefined,
    projections: {
      ...categories,
      AST: index === 0 ? 100 : categories.AST + index,
    },
    shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
  })).concat(
    {
      id: "opponent-only",
      name: "Opponent only",
      teamAbbr: undefined,
      projections: { ...categories, AST: 40 },
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
    {
      id: "third-team-only",
      name: "Third team only",
      teamAbbr: undefined,
      projections: { ...categories, AST: 10 },
      shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
    },
  ),
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: slots.map((slot, index) => ({ slot, playerId: `player-${index}` })),
    },
    {
      teamIndex: 1,
      name: "Opponent",
      entries: slots.map((slot) => ({ slot, playerId: "opponent-only" })),
    },
    {
      teamIndex: 2,
      name: "Third team",
      entries: slots.map((slot) => ({ slot, playerId: "third-team-only" })),
    },
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1, 2],
  source: "manual",
}

describe("SeasonRosterWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
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
    const playerSelect = screen.getByRole("combobox", { name: "PG player" })
    const expectedAstLevel = analyzeSeasonLeague({
      ...state,
      teams: state.teams.map((team) =>
        team.teamIndex === state.perspectiveTeamIndex
          ? {
              ...team,
              entries: team.entries.map((entry, index) =>
                index === 0 ? { ...entry, playerId: null } : entry,
              ),
            }
          : team,
      ),
    }).byTeam[0].levels.find((level) => level.categoryId === "AST")!

    expect(screen.queryAllByRole("option", { name: "Opponent only" })).toHaveLength(0)
    fireEvent.change(playerSelect, { target: { value: "" } })
    expect(screen.getByText(expectedAstLevel.z.toFixed(2))).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Save lineup" }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/season-leagues/season-1/lineup",
      expect.objectContaining({ method: "PATCH" }),
    )
  })

  it("switches to schedule tab and loads matchup games", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/season-leagues/")) {
        return new Response(
          JSON.stringify({ state, analysis: analyzeSeasonLeague(state) }),
          { status: 200 },
        )
      }
      if (url.includes("/api/schedule")) {
        return new Response(
          JSON.stringify({
            source: "fixture",
            matchup: {
              scoringPeriodId: 18,
              startDate: "2026-03-09",
              endDate: "2026-03-11",
              days: ["2026-03-09", "2026-03-10", "2026-03-11"],
            },
            games: [{ date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "LAL" }],
          }),
          { status: 200 },
        )
      }
      return new Response("missing", { status: 404 })
    })

    render(<SeasonRosterWorkspace leagueId="season-1" />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /test roster/i })).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("tab", { name: /stats/i })).toHaveAttribute(
      "aria-controls",
      "stats-panel",
    )
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "stats-panel")
    fireEvent.click(screen.getByRole("button", { name: /sort by ast, best first/i }))
    fireEvent.click(screen.getByRole("button", { name: /sort by ast, best first/i }))

    fireEvent.click(screen.getByRole("tab", { name: /schedule/i }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /player schedule/i })).toBeInTheDocument()
    })
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "schedule-panel")
    expect(screen.getByText("Games")).toBeInTheDocument()
    expect(screen.getByText("vs LAL")).toBeInTheDocument()
    expect(screen.getAllByRole("rowheader")).toHaveLength(14)
    expect(screen.getByRole("rowheader", { name: "PG · Player 1" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /league rank matrix/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: /stats/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /league rank matrix/i })).toBeInTheDocument()
    })
    expect(
      screen.getByRole("button", { name: /sort by ast, worst first/i }),
    ).toBeInTheDocument()
  })
})
