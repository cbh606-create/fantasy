import { describe, expect, it } from "vitest"
import { getPlayerPool } from "@/lib/players/provider"

describe("getPlayerPool", () => {
  it("loads the cached 2026-27 projection pool by default source", async () => {
    const pool = await getPlayerPool("proj_2026_27")

    expect(pool.fallbackUsed).toBe(false)
    expect(pool.source).toBe("proj_2026_27")
    expect(pool.players.length).toBeGreaterThan(100)
    expect(pool.players.some((player) => player.name.includes("Jokic"))).toBe(
      true,
    )
  })

  it("still loads the prior 2025-26 stats pool when requested", async () => {
    const pool = await getPlayerPool("stats_2025_26")

    expect(pool.fallbackUsed).toBe(false)
    expect(pool.source).toBe("stats_2025_26")
    expect(pool.players.length).toBeGreaterThan(100)
  })
})
