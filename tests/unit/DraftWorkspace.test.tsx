// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DraftWorkspace } from "@/components/draft/DraftWorkspace"
import type {
  LeagueState,
  SimulationResult,
} from "@/lib/domain/types"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 7,
  AST: 5,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 20,
}

const state: LeagueState = {
  settings: {
    teams: 12,
    draftType: "snake",
    rosterSlots: ["PG", "SG"],
    categories: Object.keys(projections).map((id) => ({
      id: id as keyof typeof projections,
      enabled: true,
      weight: 1,
    })),
    userPickSlot: 4,
    puntCategoryIds: ["TO"],
    focusCategoryIds: ["AST"],
    rounds: 2,
  },
  board: {
    picks: [],
    currentOverall: 1,
  },
  players: [
    {
      id: "player-1",
      name: "First Player",
      positions: ["PG"],
      projections,
      adp: 1,
      adpBySource: {
        yahoo_draft_analysis_rank: 1,
      },
    },
    {
      id: "player-2",
      name: "Second Player",
      positions: ["SG"],
      projections,
      adp: 2,
      adpBySource: {
        yahoo_draft_analysis_rank: 2,
      },
    },
  ],
  source: "manual",
  perspectiveTeamIndex: 3,
}

const simulationResult: SimulationResult = {
  nextPicks: [{ playerId: "player-1", score: 8.4, frequency: 0.75 }],
  topCombinations: [
    {
      playerIds: ["player-1", "player-2"],
      score: 15.2,
      frequency: 0.5,
    },
  ],
  categoryOutlook: {
    FG_PCT: 0.1,
    FT_PCT: 0.2,
    TPM: 0.3,
    REB: 0.4,
    AST: 0.5,
    STL: 0.6,
    BLK: 0.7,
    TO: -0.2,
    PTS: 0.8,
  },
  meta: {
    simCount: 40,
    seed: 123,
    generatedAt: "2026-07-30T00:00:00.000Z",
    latencyMs: 20,
    source: "manual",
  },
}

describe("DraftWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("loads the league and defaults to Mock without a Prep tab", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "league-1",
          name: "Test League",
          stateJson: JSON.stringify(state),
        }),
      } as Response)
      .mockImplementation(async (input) => {
        if (String(input) === "/api/players") {
          return {
            ok: true,
            json: async () => ({ players: state.players }),
          } as Response
        }
        return {
          ok: true,
          json: async () => ({
            nextPicks: [],
            topCombinations: [],
            categoryOutlook: {
              FG_PCT: 0,
              FT_PCT: 0,
              TPM: 0,
              REB: 0,
              AST: 0,
              STL: 0,
              BLK: 0,
              TO: 0,
              PTS: 0,
            },
            meta: {
              simCount: 24,
              seed: 1,
              generatedAt: "2026-08-18T00:00:00.000Z",
              latencyMs: 1,
              source: "manual",
            },
          }),
        } as Response
      })

    render(<DraftWorkspace leagueId="league-1" />)

    expect(await screen.findByText("Test League")).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Prep" })).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Mock" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByRole("tab", { name: "Live" })).toBeInTheDocument()
    expect(await screen.findByText("Punt", {}, { timeout: 4_000 })).toBeInTheDocument()
    expect(screen.getByText("Focus")).toBeInTheDocument()
  })

  it("shows a load error when the league request fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "not_found" }),
    } as Response)

    render(<DraftWorkspace leagueId="missing" />)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load this league",
    )
  })

  it("switches to live mode and continues manually after sync fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === "/api/leagues/league-1") {
        return {
          ok: true,
          json: async () => ({
            id: "league-1",
            name: "Test League",
            espnLeagueId: "fixture-league",
            season: 2026,
            stateJson: JSON.stringify({ ...state, source: "espn" }),
          }),
        } as Response
      }
      if (url === "/api/draft/simulate") {
        return {
          ok: true,
          json: async () => simulationResult,
        } as Response
      }
      return {
        ok: false,
        json: async () => ({ message: "ESPN is unavailable" }),
      } as Response
    })

    render(<DraftWorkspace initialMode="live" leagueId="league-1" />)

    expect(await screen.findByText("ESPN synced")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Sync ESPN board" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ESPN is unavailable",
    )
    fireEvent.click(screen.getByRole("button", { name: "Continue manually" }))

    expect(screen.getByText("Manual mode")).toBeInTheDocument()
  })

  it("syncs with the persisted ESPN league id and season", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/leagues/league-1") {
        return {
          ok: true,
          json: async () => ({
            id: "league-1",
            name: "Test League",
            espnLeagueId: "espn-12345",
            season: 2025,
            stateJson: JSON.stringify({ ...state, source: "espn" }),
          }),
        } as Response
      }
      if (url === "/api/draft/simulate") {
        return {
          ok: true,
          json: async () => simulationResult,
        } as Response
      }
      if (url === "/api/espn/sync-board") {
        expect(init).toEqual(
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              id: "league-1",
              leagueId: "espn-12345",
              season: 2025,
            }),
          }),
        )
        return {
          ok: false,
          json: async () => ({ message: "ESPN is unavailable" }),
        } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    })

    render(<DraftWorkspace initialMode="live" leagueId="league-1" />)

    expect(await screen.findByText("ESPN synced")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sync ESPN board" }))

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          (call) => String(call[0]) === "/api/espn/sync-board",
        ),
      ).toBe(true),
    )
  })

  it("persists a Live pick without CPU-filling later rounds", async () => {
    const userFirstState: LeagueState = {
      ...state,
      perspectiveTeamIndex: 0,
      settings: {
        ...state.settings,
        teams: 2,
        rounds: 2,
        userPickSlot: 1,
      },
      players: [
        ...state.players,
        {
          id: "player-3",
          name: "Third Player",
          positions: ["PG"],
          projections,
          adp: 3,
        },
        {
          id: "player-4",
          name: "Fourth Player",
          positions: ["SG"],
          projections,
          adp: 4,
        },
      ],
    }

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/leagues/league-1" && init?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({ id: "league-1" }),
        } as Response
      }
      if (url === "/api/leagues/league-1") {
        return {
          ok: true,
          json: async () => ({
            id: "league-1",
            name: "Test League",
            stateJson: JSON.stringify(userFirstState),
          }),
        } as Response
      }
      if (url === "/api/draft/simulate") {
        return {
          ok: true,
          json: async () => simulationResult,
        } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    })

    render(<DraftWorkspace initialMode="live" leagueId="league-1" />)

    expect(await screen.findByRole("searchbox", { name: "Search players" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), {
      target: { value: "First" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Mark First Player picked" }),
    )

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          (call) =>
            String(call[0]) === "/api/leagues/league-1" &&
            call[1]?.method === "PATCH",
        ),
      ).toBe(true),
    )
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(
        (call) =>
          String(call[0]) === "/api/leagues/league-1" &&
          call[1]?.method === "PATCH",
      )
    const patchBody = JSON.parse(String(patchCall?.[1]?.body)) as {
      state: LeagueState
    }

    expect(patchBody.state.board.picks.find((pick) => pick.overall === 1)?.playerId)
      .toBe("player-1")
    expect(patchBody.state.board.picks.find((pick) => pick.overall === 2)?.playerId)
      .toBeFalsy()
    expect(patchBody.state.board.currentOverall).toBe(2)

    await waitFor(() => {
      const simulateCalls = vi
        .mocked(fetch)
        .mock.calls.filter((call) => String(call[0]) === "/api/draft/simulate")
      expect(simulateCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("starts a Mock draft and advances CPU until the user turn", async () => {
    const mockSimulationSignals: AbortSignal[] = []
    const mockState: LeagueState = {
      ...state,
      perspectiveTeamIndex: 1,
      settings: {
        ...state.settings,
        teams: 4,
        rounds: 2,
        userPickSlot: 2,
      },
      players: [
        ...state.players,
        {
          id: "player-3",
          name: "Third Player",
          positions: ["PG"],
          projections,
          adp: 3,
          adpBySource: {
            yahoo_draft_analysis_rank: 3,
          },
        },
        {
          id: "player-4",
          name: "Fourth Player",
          positions: ["SG"],
          projections,
          adp: 4,
          adpBySource: {
            yahoo_draft_analysis_rank: 4,
          },
        },
        {
          id: "player-no-primary-adp",
          name: "No Primary Adp Player",
          positions: ["PG"],
          projections,
          adp: 5,
        },
      ],
    }

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/players") {
        return new Response(JSON.stringify({ players: mockState.players }), {
          status: 200,
        })
      }

      if (url === "/api/draft/simulate") {
        mockSimulationSignals.push(init?.signal as AbortSignal)
        return new Response(
          JSON.stringify({
            nextPicks: [
              { playerId: "player-2", score: 9, frequency: 0.6 },
              { playerId: "player-3", score: 8, frequency: 0.3 },
              { playerId: "player-4", score: 7, frequency: 0.1 },
              { playerId: "player-1", score: 6, frequency: 0.0 },
            ],
            topCombinations: [],
            categoryOutlook: {
              FG_PCT: 0,
              FT_PCT: 0,
              TPM: 0,
              REB: 0,
              AST: 0,
              STL: 0,
              BLK: 0,
              TO: 0,
              PTS: 0,
            },
            meta: {
              simCount: 40,
              seed: 1,
              generatedAt: "2026-08-18T00:00:00.000Z",
              latencyMs: 1,
              source: "manual",
            },
          } satisfies SimulationResult),
          { status: 200 },
        )
      }

      return new Response(
        JSON.stringify({
          id: "league-1",
          name: "Test League",
          stateJson: JSON.stringify(mockState),
        }),
        { status: 200 },
      )
    })

    render(<DraftWorkspace leagueId="league-1" />)

    fireEvent.click(await screen.findByRole("tab", { name: "Mock" }))

    expect(await screen.findByText(/practice only/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reset mock draft" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Random pick slot" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Number of teams" })).toHaveValue(
      "4",
    )
    expect(screen.getByRole("combobox", { name: "Your pick slot" })).toHaveValue(
      "2",
    )
    expect(
      screen.queryByRole("button", { name: "Mark No Primary Adp Player picked" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: /ADP/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sort by ADP" })).toBeInTheDocument()
    await waitFor(
      () => {
        expect(screen.getByText(/your turn to pick/i)).toBeInTheDocument()
      },
      { timeout: 3_000 },
    )
    await waitFor(
      () => {
        const nextPicksHeading = screen.getByRole("heading", {
          name: /next picks/i,
        })
        const recSection = nextPicksHeading.closest("section")
        expect(recSection).toHaveTextContent("Second Player")
      },
      { timeout: 4_000 },
    )
    expect(
      screen.getByRole("heading", { name: /next picks/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: /category outlook/i }),
    ).not.toBeInTheDocument()
    expect(
      vi.mocked(fetch).mock.calls.some(
        (call) => String(call[0]) === "/api/draft/simulate",
      ),
    ).toBe(true)
    const mockSimulateCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => String(call[0]) === "/api/draft/simulate")
    const mockSimulateBody = JSON.parse(
      String(mockSimulateCall?.[1]?.body ?? "{}"),
    ) as {
      simCount?: number
      fastRecommendations?: boolean
    }
    expect(mockSimulateBody.simCount).toBe(24)
    expect(mockSimulateBody.fastRecommendations).toBe(true)
    expect(mockSimulationSignals[0]?.aborted).toBe(false)
    expect(screen.getByText(/latest pick/i)).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "Mark Second Player picked" }),
    )

    expect(mockSimulationSignals[0]?.aborted).toBe(true)

    fireEvent.change(screen.getByRole("combobox", { name: "Your pick slot" }), {
      target: { value: "1" },
    })
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Your pick slot" })).toHaveValue(
        "1",
      )
    })
    await waitFor(
      () => {
        expect(screen.getByText(/your turn to pick/i)).toBeInTheDocument()
      },
      { timeout: 3_000 },
    )

    fireEvent.change(screen.getByRole("combobox", { name: "Number of teams" }), {
      target: { value: "8" },
    })
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Number of teams" })).toHaveValue(
        "8",
      )
    })
    expect(screen.getByRole("combobox", { name: "Your pick slot" })).toHaveValue(
      "1",
    )
    await waitFor(
      () => {
        expect(screen.getByText(/your turn to pick/i)).toBeInTheDocument()
      },
      { timeout: 3_000 },
    )
  })
})
