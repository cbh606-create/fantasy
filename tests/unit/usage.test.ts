import { describe, expect, it } from "vitest"
import { allocateUsage, weightedUsage } from "@/lib/projections/usage"

describe("allocateUsage", () => {
  it("hits minutes-weighted 100", () => {
    const { usg, weighted } = allocateUsage(
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
    expect(weighted).toBeCloseTo(100, 3)
    expect(weightedUsage(usg, mpg)).toBeCloseTo(100, 3)
    for (const v of usg.values()) {
      expect(v).toBeGreaterThanOrEqual(8)
      expect(v).toBeLessThanOrEqual(35)
    }
  })

  it("keeps sub-8 usage when they got no vacancy minutes", () => {
    const { usg } = allocateUsage(
      [
        { playerId: "bench", positions: ["PF"], mpg: 10, priorMpg: 10, priorUsg: 5 },
        { playerId: "a", positions: ["PG"], mpg: 115, priorUsg: 30 },
        { playerId: "b", positions: ["SF"], mpg: 115, priorUsg: 30 }
      ],
      {
        season: 2026,
        teamId: "AAA",
        players: [
          { playerId: "bench", positions: ["PF"] },
          { playerId: "a", positions: ["PG"] },
          { playerId: "b", positions: ["SF"] }
        ],
        departed: []
      }
    )
    expect(usg.get("bench")!).toBeLessThan(8)
  })

  it("floors to 8 when they received vacancy minutes", () => {
    const { usg } = allocateUsage(
      [
        { playerId: "bench", positions: ["PF"], mpg: 20, priorMpg: 10, priorUsg: 5 },
        { playerId: "a", positions: ["PG"], mpg: 110, priorUsg: 30 },
        { playerId: "b", positions: ["SF"], mpg: 110, priorUsg: 30 }
      ],
      {
        season: 2026,
        teamId: "AAA",
        players: [
          { playerId: "bench", positions: ["PF"] },
          { playerId: "a", positions: ["PG"] },
          { playerId: "b", positions: ["SF"] }
        ],
        departed: []
      }
    )
    expect(usg.get("bench")!).toBeGreaterThanOrEqual(8)
  })
})
