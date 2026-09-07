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
  it("never emits mpg above 38 and accepts closest sum on a short roster", () => {
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 34 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 }
      ],
      roster
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeLessThan(240)
    for (const value of mpg.values()) {
      expect(value).toBeLessThanOrEqual(38)
    }
  })

  it("lets a 6-player team sum under 240 while capping mpg", () => {
    const shortRoster: RosterSnapshot = {
      season: 2026,
      teamId: "BBB",
      players: [
        { playerId: "g1", positions: ["PG"] },
        { playerId: "g2", positions: ["SG"] },
        { playerId: "w1", positions: ["SF"] },
        { playerId: "w2", positions: ["SF"] },
        { playerId: "b1", positions: ["C"] },
        { playerId: "b2", positions: ["PF"] }
      ],
      departed: []
    }
    const mpg = allocateMinutes(
      [
        { playerId: "g1", positions: ["PG"], priorMpg: 24 },
        { playerId: "g2", positions: ["SG"], priorMpg: 20 },
        { playerId: "w1", positions: ["SF"], priorMpg: 28 },
        { playerId: "w2", positions: ["SF"], priorMpg: 16 },
        { playerId: "b1", positions: ["C"], priorMpg: 30 },
        { playerId: "b2", positions: ["PF"], priorMpg: 22 }
      ],
      shortRoster
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeLessThan(240)
    expect(sum).toBeCloseTo(228, 5)
    for (const value of mpg.values()) {
      expect(value).toBeLessThanOrEqual(38)
    }
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
    expect(mpg.get("backup")! - 16).toBeGreaterThan(mpg.get("wing")! - 30)
  })

  it("caps at 38 on an 8-player roster while same-bucket backup gains more", () => {
    const fullRoster: RosterSnapshot = {
      season: 2026,
      teamId: "AAA",
      players: [
        { playerId: "star", positions: ["PG"] },
        { playerId: "backup", positions: ["PG"] },
        { playerId: "sg", positions: ["SG"] },
        { playerId: "wing", positions: ["SF"] },
        { playerId: "pf", positions: ["PF"] },
        { playerId: "c", positions: ["C"] },
        { playerId: "bench1", positions: ["SG"] },
        { playerId: "bench2", positions: ["PF"] }
      ],
      departed: [{ playerId: "gone", lastMpg: 36, lastUsg: 28, positions: ["PG"] }]
    }
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 32 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "sg", positions: ["SG"], priorMpg: 26 },
        { playerId: "wing", positions: ["SF"], priorMpg: 22 },
        { playerId: "pf", positions: ["PF"], priorMpg: 24 },
        { playerId: "c", positions: ["C"], priorMpg: 28 },
        { playerId: "bench1", positions: ["SG"], priorMpg: 18 },
        { playerId: "bench2", positions: ["PF"], priorMpg: 14 }
      ],
      fullRoster
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
    for (const value of mpg.values()) {
      expect(value).toBeLessThanOrEqual(38)
    }
    expect(mpg.get("backup")! - 16).toBeGreaterThan(mpg.get("wing")! - 22)
  })
})
