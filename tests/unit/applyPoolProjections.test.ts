import { describe, expect, it } from "vitest"
import { applyPoolProjections } from "@/lib/players/applyPoolProjections"
import type { SeasonPlayer } from "@/lib/season/types"

const pool = [
  {
    id: "espn-3112335",
    espnId: "3112335",
    name: "Nikola Jokic",
    teamAbbr: "DEN",
    projectedGames: 74,
    projections: {
      FG_PCT: 0.57,
      FT_PCT: 0.83,
      TPM: 130,
      REB: 940,
      AST: 747,
      STL: 100,
      BLK: 60,
      TO: 250,
      PTS: 2144,
    },
  },
]

const seasonPlayer = (overrides: Partial<SeasonPlayer> = {}): SeasonPlayer => ({
  id: "3112335",
  name: "Nikola Jokic",
  teamAbbr: "DEN",
  projections: {
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 1,
    REB: 1,
    AST: 1,
    STL: 1,
    BLK: 1,
    TO: 1,
    PTS: 100,
  },
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  ...overrides,
})

describe("applyPoolProjections", () => {
  it("matches espn- pool ids to numeric season ids", () => {
    const { players, report } = applyPoolProjections([seasonPlayer()], pool)
    expect(report.matched).toHaveLength(1)
    expect(players[0].projections.PTS).toBe(2144)
    expect(players[0].projectedGames).toBe(74)
  })

  it("falls back to normalized name when ids differ", () => {
    const { players, report } = applyPoolProjections(
      [seasonPlayer({ id: "other" })],
      pool,
    )
    expect(report.matched).toHaveLength(1)
    expect(players[0].projections.PTS).toBe(2144)
  })

  it("leaves unmatched players unchanged", () => {
    const target = seasonPlayer({
      id: "999",
      name: "Unknown Player",
    })
    const { players, report } = applyPoolProjections([target], pool)
    expect(report.unmatched).toHaveLength(1)
    expect(players[0].projections.PTS).toBe(100)
  })
})
