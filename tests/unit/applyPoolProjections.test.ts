import { describe, expect, it } from "vitest"
import {
  applyPoolInjuryStatus,
  applyPoolProjectionStats,
  applyPoolProjections,
} from "@/lib/players/applyPoolProjections"
import type { SeasonPlayer } from "@/lib/season/types"

const pool = [
  {
    id: "espn-3112335",
    espnId: "3112335",
    name: "Nikola Jokic",
    teamAbbr: "DEN",
    status: "out" as const,
    projectedGames: 74,
    shooting: { FGM: 800, FGA: 1400, FTM: 400, FTA: 480 },
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
    expect(players[0].injuryStatus).toBe("out")
    expect(players[0].shooting).toEqual({
      FGM: 800,
      FGA: 1400,
      FTM: 400,
      FTA: 480,
    })
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

  it("keeps seasonRates when the projection overlay replaces totals", () => {
    const target = seasonPlayer({
      seasonRates: {
        gamesPlayed: 24,
        projections: {
          FG_PCT: 0.45,
          FT_PCT: 0.8,
          TPM: 2,
          REB: 4,
          AST: 3,
          STL: 1,
          BLK: 0.2,
          TO: 1,
          PTS: 12,
        },
        shooting: { FGM: 5, FGA: 11, FTM: 2, FTA: 2 },
      },
    })
    const { players } = applyPoolProjections([target], pool)
    expect(players[0].projections.PTS).toBe(2144)
    expect(players[0].seasonRates).toEqual(target.seasonRates)
  })

  it("copies out status without replacing the stored projection", () => {
    const target = seasonPlayer()
    const [player] = applyPoolInjuryStatus([target], pool)
    expect(player.injuryStatus).toBe("out")
    expect(player.projections.PTS).toBe(100)
  })

  it("does not attach projectedGames when the pool player has no team", () => {
    const unsignedPool = [
      {
        id: "espn-2779",
        espnId: "2779",
        name: "Chris Paul",
        status: "active" as const,
        projectedGames: 74,
        projections: {
          FG_PCT: 0.4,
          FT_PCT: 0.8,
          TPM: 100,
          REB: 200,
          AST: 400,
          STL: 80,
          BLK: 10,
          TO: 150,
          PTS: 800,
        },
      },
    ]
    const { players } = applyPoolProjections(
      [
        seasonPlayer({
          id: "2779",
          name: "Chris Paul",
          teamAbbr: "LAC",
          projectedGames: 82,
        }),
      ],
      unsignedPool,
    )
    expect(players[0]?.teamAbbr).toBe("LAC")
    expect(players[0]?.projectedGames).toBeUndefined()
  })

  it("copies a real pool line without changing injury", () => {
    const target = seasonPlayer({ injuryStatus: "out" })
    const [player] = applyPoolProjectionStats([target], pool)
    expect(player?.projections.PTS).toBe(2144)
    expect(player?.projectedGames).toBe(74)
    expect(player?.injuryStatus).toBe("out")
  })

  it("leaves a saved line in place when the pool row is an empty stub", () => {
    const stub = [
      {
        id: "espn-3907387",
        espnId: "3907387",
        name: "Ben Simmons",
        teamAbbr: "SAC",
        status: "active" as const,
        projections: {
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
      },
    ]
    const target = seasonPlayer({
      id: "3907387",
      name: "Ben Simmons",
      projections: {
        FG_PCT: 0.5,
        FT_PCT: 0.7,
        TPM: 0,
        REB: 5,
        AST: 5,
        STL: 1,
        BLK: 1,
        TO: 2,
        PTS: 12,
      },
    })
    const [player] = applyPoolProjectionStats([target], stub)
    expect(player?.projections.PTS).toBe(12)
  })
})
