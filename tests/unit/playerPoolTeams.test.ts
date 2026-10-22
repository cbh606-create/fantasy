import { describe, expect, it } from "vitest"
import pool from "../../data/players/proj_2026_27.json"

type PoolPlayer = {
  name: string
  teamAbbr?: string | null
  positions?: string[]
  projectedGames?: number
  projections?: { PTS?: number; REB?: number; AST?: number; TPM?: number }
  shooting?: { FGM?: number; FGA?: number; FTM?: number; FTA?: number }
}

const teamOf = (name: string) =>
  (pool.players as PoolPlayer[]).find((player) => player.name === name)
    ?.teamAbbr ?? null

describe("2026-27 pool last-month team moves", () => {
  it("pins verified late-August / September 2026 destinations", () => {
    expect(teamOf("Klay Thompson")).toBe("MIA")
    expect(teamOf("Jonathan Kuminga")).toBe("MIN")
    expect(teamOf("Ben Simmons")).toBe("SAC")
    expect(teamOf("Bennedict Mathurin")).toBe("NOP")
    expect(teamOf("Kawhi Leonard")).toBe("TOR")
    expect(teamOf("Brandon Ingram")).toBe("LAC")
    expect(teamOf("Gradey Dick")).toBe("LAC")
    expect(teamOf("Buddy Hield")).toBe("CHA")
    expect(teamOf("Cam Whitmore")).toBe("DEN")
  })

  it("stores Ben Simmons as the ESPN 2027 season projection", () => {
    const player = (pool.players as PoolPlayer[]).find(
      (row) => row.name === "Ben Simmons",
    )
    expect(player?.positions).toEqual(["PG"])
    expect(player?.projectedGames).toBe(37)
    expect(player?.projections).toMatchObject({
      PTS: 185,
      REB: 185,
      AST: 196,
      TPM: 0,
    })
    expect(player?.shooting).toEqual({
      FGM: 84,
      FGA: 159,
      FTM: 17,
      FTA: 26,
    })
  })

  it("leaves unsigned veterans without a guessed team", () => {
    expect(teamOf("Chris Paul")).toBeNull()
    expect(teamOf("Russell Westbrook")).toBeNull()
  })
})
