import { describe, expect, it } from "vitest"
import { allocateMinutes } from "@/lib/projections/minutes"
import type { RosterSnapshot } from "@/lib/projections/types"

const roster: RosterSnapshot = {
  season: 2026,
  teamId: "AAA",
  players: [
    { playerId: "star", positions: ["PG"] },
    { playerId: "backup", positions: ["PG"] },
    { playerId: "wing", positions: ["SF"] }
  ],
  departed: [{ playerId: "gone", lastMpg: 36, lastUsg: 28, positions: ["PG"] }]
}

describe("allocateMinutes", () => {
  it("sums to 240", () => {
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 34 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 }
      ],
      roster
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
  })

  it("gives leftover minutes to the same bucket as the departed star", () => {
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 34 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 }
      ],
      roster
    )
    expect(mpg.get("backup")!).toBeGreaterThan(16)
    expect(mpg.get("backup")!).toBeGreaterThan(mpg.get("wing")! - 30)
    expect(Math.max(...mpg.values())).toBeLessThanOrEqual(38)
  })
})
