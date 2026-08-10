import { describe, expect, it } from "vitest"
import { getPlayerPool } from "@/lib/players/provider"

describe("getPlayerPool", () => {
  it("loads the cached 2025-26 stats pool", async () => {
    const pool = await getPlayerPool("stats_2025_26")

    expect(pool.fallbackUsed).toBe(false)
    expect(pool.source).toBe("stats_2025_26")
    expect(pool.players.length).toBeGreaterThan(100)
    expect(pool.players[0]?.adp).toBe(1)
    expect(pool.players.some((player) => player.name.includes("Jokic"))).toBe(
      true,
    )
  })

  it("falls back to sample when an unknown projection file is missing", async () => {
    const pool = await getPlayerPool("proj_2026_27")

    expect(pool.players.length).toBeGreaterThan(0)
    // Prefer stats cache over sample when available.
    expect(["stats_2025_26", "sample"]).toContain(pool.source)
  })
})
