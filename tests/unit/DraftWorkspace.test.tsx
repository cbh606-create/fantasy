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
    },
    {
      id: "player-2",
      name: "Second Player",
      positions: ["SG"],
      projections,
      adp: 2,
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

  it("loads league goals and runs a 40-count simulation", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "league-1",
          name: "Test League",
          stateJson: JSON.stringify(state),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => simulationResult,
      } as Response)

    render(<DraftWorkspace leagueId="league-1" />)

    expect(await screen.findByText("Test League")).toBeInTheDocument()
    expect(screen.getByText("Focus AST")).toBeInTheDocument()
    expect(screen.getByText("Punt TO")).toBeInTheDocument()
    expect(screen.getByLabelText("Simulation count")).toHaveValue(40)

    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/draft/simulate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ state, simCount: 40 }),
      }),
    )
    expect(await screen.findAllByText("First Player")).not.toHaveLength(0)
    expect(screen.getByText("First Player + Second Player")).toBeInTheDocument()
    expect(screen.getByText("AST")).toBeInTheDocument()
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
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "league-1",
          name: "Test League",
          stateJson: JSON.stringify({ ...state, source: "espn" }),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "ESPN is unavailable" }),
      } as Response)

    render(<DraftWorkspace leagueId="league-1" />)

    fireEvent.click(await screen.findByRole("tab", { name: "Live" }))
    expect(screen.getByText("ESPN synced")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Sync ESPN board" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ESPN is unavailable",
    )
    fireEvent.click(screen.getByRole("button", { name: "Continue manually" }))

    expect(screen.getByText("Manual mode")).toBeInTheDocument()
  })

  it("persists a manual pick then refreshes recommendations after 400ms", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "league-1",
          name: "Test League",
          stateJson: JSON.stringify(state),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "league-1" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => simulationResult,
      } as Response)

    render(<DraftWorkspace leagueId="league-1" />)

    fireEvent.click(await screen.findByRole("tab", { name: "Live" }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), {
      target: { value: "First" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Mark First Player picked" }),
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/leagues/league-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"playerId":"player-1"'),
      }),
    )

    await waitFor(
      () => expect(fetch).toHaveBeenCalledTimes(3),
      { timeout: 1_000 },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/draft/simulate",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
