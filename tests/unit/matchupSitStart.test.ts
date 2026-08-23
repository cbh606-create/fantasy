import { describe, expect, it, vi } from "vitest"
import * as board from "@/lib/matchup/board"
import { applySitStartSwap, suggestSitStart } from "@/lib/matchup/sitStart"
import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const coldStarter: SeasonPlayer = {
  id: "cold-starter",
  name: "Cold Starter",
  teamAbbr: "NYK",
  projections: {
    FG_PCT: 0.4,
    FT_PCT: 0.7,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 820,
  },
  shooting: { FGM: 300, FGA: 750, FTM: 100, FTA: 140 },
}

const benchStar: SeasonPlayer = {
  id: "bench-star",
  name: "Bench Star",
  teamAbbr: "BOS",
  projections: {
    FG_PCT: 0.55,
    FT_PCT: 0.85,
    TPM: 200,
    REB: 600,
    AST: 400,
    STL: 100,
    BLK: 80,
    TO: 150,
    PTS: 2460,
  },
  shooting: { FGM: 900, FGA: 1640, FTM: 400, FTA: 470 },
}

const oppPlayer: SeasonPlayer = {
  id: "opp-player",
  name: "Opp Player",
  teamAbbr: "MIA",
  projections: {
    FG_PCT: 0.48,
    FT_PCT: 0.78,
    TPM: 120,
    REB: 350,
    AST: 280,
    STL: 60,
    BLK: 40,
    TO: 120,
    PTS: 1640,
  },
  shooting: { FGM: 600, FGA: 1250, FTM: 280, FTA: 360 },
}

const youEntries: SeasonRosterEntry[] = [
  { slot: "UTIL", playerId: "cold-starter" },
  { slot: "BE", playerId: "bench-star" },
]

const oppEntries: SeasonRosterEntry[] = [{ slot: "UTIL", playerId: "opp-player" }]

const players = [coldStarter, benchStar, oppPlayer]

describe("suggestSitStart", () => {
  it("recommends promoting a high-volume BE over a zero-game active", () => {
    const gamesMap = new Map<string, number>([
      ["cold-starter", 0],
      ["bench-star", 3],
      ["opp-player", 2],
    ])

    const suggestions = suggestSitStart({
      youEntries,
      oppEntries,
      players,
      gamesMap,
    })

    expect(suggestions[0]?.benchPlayerId).toBe("bench-star")
    expect(suggestions[0]?.activePlayerId).toBe("cold-starter")
    expect(suggestions[0]?.deltaProjectedCatWins).toBeGreaterThan(0)
    expect(suggestions[0]?.reason).toMatch(/cat wins/)
  })

  it("returns empty when no swap improves projected cat wins", () => {
    const gamesMap = new Map<string, number>([
      ["cold-starter", 3],
      ["bench-star", 0],
      ["opp-player", 0],
    ])

    const suggestions = suggestSitStart({
      youEntries,
      oppEntries,
      players,
      gamesMap,
    })

    expect(suggestions).toEqual([])
  })

  it("passes categoryIds through to buildMatchupBoard", () => {
    const gamesMap = new Map<string, number>([
      ["cold-starter", 0],
      ["bench-star", 3],
      ["opp-player", 2],
    ])
    const spy = vi.spyOn(board, "buildMatchupBoard")

    suggestSitStart({
      youEntries,
      oppEntries,
      players,
      gamesMap,
      categoryIds: ["PTS", "REB"],
    })

    expect(spy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      ["PTS", "REB"],
    )
    spy.mockRestore()
  })
})

describe("applySitStartSwap", () => {
  const entries: SeasonRosterEntry[] = [
    { slot: "UTIL", playerId: "a" },
    { slot: "BE", playerId: "b" },
  ]

  it("swaps ids between BE and active slots", () => {
    const next = applySitStartSwap(entries, {
      benchPlayerId: "b",
      activePlayerId: "a",
    })

    expect(next).not.toHaveProperty("error")
    if ("error" in next) return

    expect(next).toEqual([
      { slot: "UTIL", playerId: "b" },
      { slot: "BE", playerId: "a" },
    ])
    expect(entries).toEqual([
      { slot: "UTIL", playerId: "a" },
      { slot: "BE", playerId: "b" },
    ])
  })

  it("returns stale_lineup when ids missing", () => {
    expect(
      applySitStartSwap(entries, { benchPlayerId: "x", activePlayerId: "a" }),
    ).toEqual({
      error: "stale_lineup",
    })
  })
})
