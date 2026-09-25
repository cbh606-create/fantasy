import { describe, expect, it } from "vitest"
import pool from "../../data/players/proj_2026_27.json"

type PoolPlayer = { name: string; teamAbbr?: string | null }

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

  it("leaves unsigned veterans without a guessed team", () => {
    expect(teamOf("Chris Paul")).toBeNull()
    expect(teamOf("Russell Westbrook")).toBeNull()
  })
})
