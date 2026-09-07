import { describe, expect, it } from "vitest"
import { allocateUsage, weightedUsage } from "@/lib/projections/usage"

describe("allocateUsage", () => {
  it("hits minutes-weighted 100", () => {
    const usg = allocateUsage(
      [
        { playerId: "a", positions: ["PG"], mpg: 36, priorUsg: 28 },
        { playerId: "b", positions: ["PG"], mpg: 24, priorUsg: 18 },
        { playerId: "c", positions: ["SF"], mpg: 180, priorUsg: 16 }
      ],
      {
        season: 2026,
        teamId: "AAA",
        players: [
          { playerId: "a", positions: ["PG"] },
          { playerId: "b", positions: ["PG"] },
          { playerId: "c", positions: ["SF"] }
        ],
        departed: [{ playerId: "gone", lastMpg: 36, lastUsg: 30, positions: ["PG"] }]
      }
    )
    const mpg = new Map([
      ["a", 36],
      ["b", 24],
      ["c", 180]
    ])
    expect(weightedUsage(usg, mpg)).toBeCloseTo(100, 3)
    for (const v of usg.values()) {
      expect(v).toBeGreaterThanOrEqual(8)
      expect(v).toBeLessThanOrEqual(35)
    }
  })
})
