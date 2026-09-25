import { describe, expect, it } from "vitest"
import { allocateMinutes, rotationWidth } from "@/lib/projections/minutes"
import type { NbaPosition, RosterSnapshot, SeasonBox } from "@/lib/projections/types"

const box = (playerId: string, teamId: string, mpg: number): SeasonBox => ({
  playerId,
  name: playerId,
  season: 2025,
  teamId,
  age: 26,
  positions: ["SG"],
  gp: 70,
  mp: mpg * 70,
  mpg,
  usg: 20,
  pts: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  tpm: 0,
  fgm: 0,
  fga: 0,
  ftm: 0,
  fta: 0
})

describe("rotationWidth", () => {
  it("counts last-year teammates at 10+ MPG and ignores garbage time and TOT", () => {
    const boxes = [
      box("a", "AAA", 34),
      box("b", "AAA", 22),
      box("c", "AAA", 12),
      box("d", "AAA", 10),
      box("e", "AAA", 9),
      box("f", "AAA", 4),
      box("g", "BBB", 36),
      box("tot", "TOT", 30)
    ]
    expect(rotationWidth(boxes, "AAA", 13)).toBe(8)
  })

  it("uses 10 when the franchise has no last-year boxes", () => {
    expect(rotationWidth([box("x", "BBB", 36)], "AAA", 13)).toBe(10)
  })

  it("clamps a 14-deep injury year to roster size", () => {
    const boxes = Array.from({ length: 14 }, (_, i) => box(`p${i}`, "AAA", 12))
    expect(rotationWidth(boxes, "AAA", 13)).toBe(13)
  })

  it("returns roster size when the roster is shorter than 8", () => {
    const boxes = Array.from({ length: 10 }, (_, i) => box(`p${i}`, "AAA", 20))
    expect(rotationWidth(boxes, "AAA", 6)).toBe(6)
  })
})

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

const thirteenRoster = (teamId: string, departed: RosterSnapshot["departed"] = []): RosterSnapshot => ({
  season: 2026,
  teamId,
  players: Array.from({ length: 13 }, (_, i) => ({
    playerId: `p${i}`,
    positions: (i % 2 === 0 ? ["SG"] : ["SF"]) as NbaPosition[]
  })),
  departed
})

const thirteenInputs = (priors = [36, 34, 32, 30, 28, 24, 22, 20, 18, 16, 14, 12, 10]) =>
  priors.map((priorMpg, i) => ({
    playerId: `p${i}`,
    positions: (i % 2 === 0 ? ["SG"] : ["SF"]) as NbaPosition[],
    priorMpg
  }))

describe("allocateMinutes", () => {
  it("never emits mpg above 38 and accepts closest sum on a short roster", () => {
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 34 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 }
      ],
      roster,
      3
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeLessThan(240)
    expect(sum).toBeCloseTo(80, 5)
    expect(mpg.get("star")).toBe(34)
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
      shortRoster,
      6
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeLessThan(240)
    expect(sum).toBeCloseTo(162, 5)
    expect(mpg.get("b1")).toBe(30)
    expect(mpg.get("w2")).toBe(38)
    for (const value of mpg.values()) {
      expect(value).toBeLessThanOrEqual(38)
    }
  })

  it("keeps the top 5 at last-year mpg and zeros players outside a 10-man rotation", () => {
    const mpg = allocateMinutes(thirteenInputs(), thirteenRoster("CCC"), 10)
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
    expect(mpg.get("p0")).toBe(36)
    expect(mpg.get("p4")).toBe(28)
    expect(mpg.get("p10")).toBe(0)
    expect(mpg.get("p11")).toBe(0)
    expect(mpg.get("p12")).toBe(0)
    for (const id of ["p5", "p6", "p7", "p8", "p9"]) {
      expect(mpg.get(id)!).toBeGreaterThan(0)
    }
  })

  it("zeros ranks 9-13 on an 8-man last-year rotation", () => {
    const mpg = allocateMinutes(thirteenInputs(), thirteenRoster("CCC"), 8)
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
    expect(mpg.get("p0")).toBe(36)
    expect(mpg.get("p8")).toBe(0)
    expect(mpg.get("p12")).toBe(0)
    expect(mpg.get("p5")!).toBeGreaterThan(0)
    expect(mpg.get("p7")!).toBeGreaterThan(0)
  })

  it("cascades capped leftover to benchmates still under 38", () => {
    const capRoster = thirteenRoster("CAP")
    const priors = [20, 19, 18, 17, 16, 15, 14, 1, 0, 0, 0, 0, 0]
    const mpg = allocateMinutes(thirteenInputs(priors), capRoster, 8)
    expect(mpg.get("p0")).toBe(20)
    expect(mpg.get("p1")).toBe(19)
    expect(mpg.get("p2")).toBe(18)
    expect(mpg.get("p3")).toBe(17)
    expect(mpg.get("p4")).toBe(16)
    expect(mpg.get("p5")).toBe(38)
    expect(mpg.get("p6")).toBe(38)
    const p7Mpg = mpg.get("p7")!
    expect(p7Mpg).toBeGreaterThan(1)
    expect(p7Mpg).toBeLessThanOrEqual(38)
    for (const value of mpg.values()) {
      expect(value).toBeLessThanOrEqual(38)
    }
  })

  it("ignores input rows whose playerId is not on the roster", () => {
    const mpg = allocateMinutes(
      [
        ...thirteenInputs().slice(0, 8),
        { playerId: "ghost", positions: ["PG"], priorMpg: 40 }
      ],
      thirteenRoster("CCC"),
      8
    )
    expect(mpg.has("ghost")).toBe(false)
    expect(mpg.get("ghost")).toBeUndefined()
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
  })

  it("sends vacancy leftover to the same-bucket bench and leaves the star unchanged", () => {
    const fullRoster: RosterSnapshot = {
      season: 2026,
      teamId: "AAA",
      players: [
        { playerId: "star", positions: ["PG"] },
        { playerId: "sg", positions: ["SG"] },
        { playerId: "wing", positions: ["SF"] },
        { playerId: "pf", positions: ["PF"] },
        { playerId: "c", positions: ["C"] },
        { playerId: "wing2", positions: ["SF"] },
        { playerId: "backup", positions: ["PG"] },
        { playerId: "bench2", positions: ["PF"] }
      ],
      departed: [{ playerId: "gone", lastMpg: 36, lastUsg: 28, positions: ["PG"] }]
    }
    const mpg = allocateMinutes(
      [
        { playerId: "star", positions: ["PG"], priorMpg: 36 },
        { playerId: "sg", positions: ["SG"], priorMpg: 32 },
        { playerId: "wing", positions: ["SF"], priorMpg: 30 },
        { playerId: "pf", positions: ["PF"], priorMpg: 28 },
        { playerId: "c", positions: ["C"], priorMpg: 26 },
        { playerId: "wing2", positions: ["SF"], priorMpg: 18 },
        { playerId: "backup", positions: ["PG"], priorMpg: 16 },
        { playerId: "bench2", positions: ["PF"], priorMpg: 14 }
      ],
      fullRoster,
      8
    )
    const sum = [...mpg.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(240, 5)
    expect(mpg.get("star")).toBe(36)
    expect(mpg.get("backup")! - 16).toBeGreaterThan(mpg.get("wing2")! - 18)
  })
})
