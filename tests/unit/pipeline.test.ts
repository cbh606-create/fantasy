import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { projectSeason } from "@/lib/projections/pipeline"
import type { NbaPosition, SeasonBox } from "@/lib/projections/types"

const CATEGORY_KEYS = [...ALL_CATEGORY_IDS]

const seasonBox = (
  playerId: string,
  name: string,
  positions: NbaPosition[],
  teamId = "OTH"
): SeasonBox => ({
  playerId,
  name,
  season: 2025,
  teamId,
  age: 26,
  positions,
  gp: 70,
  mp: 2100,
  mpg: 30,
  usg: 20,
  pts: 1400,
  reb: 400,
  ast: 350,
  stl: 80,
  blk: 50,
  tov: 180,
  tpm: 140,
  fgm: 520,
  fga: 1100,
  ftm: 240,
  fta: 300
})

describe("projectSeason", () => {
  it("projects veterans and a rookie on one team", () => {
    const boxes: SeasonBox[] = [
      seasonBox("vetG", "Vet G", ["PG"], "AAA"),
      seasonBox("vetWing", "Vet Wing", ["SF"], "AAA"),
      seasonBox("vetBig", "Vet Big", ["C"], "AAA"),
      seasonBox("g2", "G Two", ["SG"]),
      seasonBox("g3", "G Three", ["PG"]),
      seasonBox("w2", "Wing Two", ["SF"]),
      seasonBox("w3", "Wing Three", ["SF"]),
      seasonBox("b2", "Big Two", ["PF"]),
      seasonBox("b3", "Big Three", ["C"])
    ]

    const out = projectSeason(
      boxes,
      [
        {
          season: 2026,
          teamId: "AAA",
          players: [
            { playerId: "vetG", positions: ["PG"] },
            { playerId: "vetWing", positions: ["SF"] },
            { playerId: "vetBig", positions: ["C"] },
            { playerId: "rookie", positions: ["PG"] }
          ],
          departed: []
        }
      ],
      [{ playerId: "rookie", name: "Rookie", positions: ["PG"], age: 19, draftSlot: 1 }]
    )

    expect(out).toHaveLength(4)
    for (const row of out) {
      expect(Object.keys(row.projections)).toHaveLength(9)
      for (const key of CATEGORY_KEYS) {
        expect(row.projections).toHaveProperty(key)
      }
      expect(row.agingApplied).toBe(false)
    }

    const mpgSum = out.reduce((total, row) => total + row.mpg, 0)
    expect(mpgSum).toBeLessThan(240)
    expect(mpgSum).toBeCloseTo(152, 5)
    for (const row of out) {
      expect(row.mpg).toBeLessThanOrEqual(38)
    }

    expect(out.find((row) => row.playerId === "rookie")?.source).toBe("rookie_prior")
    expect(out.find((row) => row.playerId === "vetG")?.source).toBe("model")
    expect(out.find((row) => row.playerId === "vetWing")?.source).toBe("model")
    expect(out.find((row) => row.playerId === "vetBig")?.source).toBe("model")
    expect(out.find((row) => row.playerId === "rookie")?.gp).toBe(70)
  })

  it("uses draft-slot gp for rookies without gamesPrior blend", () => {
    const boxes: SeasonBox[] = [
      { ...seasonBox("g1", "G One", ["PG"]), gp: 40 },
      { ...seasonBox("g2", "G Two", ["SG"]), gp: 40 },
      { ...seasonBox("g3", "G Three", ["PG"]), gp: 40 },
      seasonBox("w1", "Wing One", ["SF"]),
      seasonBox("w2", "Wing Two", ["SF"]),
      seasonBox("w3", "Wing Three", ["SF"]),
      seasonBox("b1", "Big One", ["C"]),
      seasonBox("b2", "Big Two", ["PF"]),
      seasonBox("b3", "Big Three", ["C"])
    ]

    const out = projectSeason(
      boxes,
      [
        {
          season: 2026,
          teamId: "AAA",
          players: [{ playerId: "lottery", positions: ["PG"] }],
          departed: []
        }
      ],
      [{ playerId: "lottery", name: "Lottery", positions: ["PG"], age: 19, draftSlot: 1 }]
    )

    expect(out.find((row) => row.playerId === "lottery")?.gp).toBe(70)
  })

  it("keeps draft-slot usg for untranslated rookies", () => {
    const boxes: SeasonBox[] = [
      seasonBox("g1", "G One", ["PG"]),
      seasonBox("g2", "G Two", ["SG"]),
      seasonBox("g3", "G Three", ["PG"]),
      seasonBox("w1", "Wing One", ["SF"]),
      seasonBox("w2", "Wing Two", ["SF"]),
      seasonBox("w3", "Wing Three", ["SF"]),
      seasonBox("b1", "Big One", ["C"]),
      seasonBox("b2", "Big Two", ["PF"]),
      seasonBox("b3", "Big Three", ["C"])
    ]

    const out = projectSeason(
      boxes,
      [
        {
          season: 2026,
          teamId: "AAA",
          players: [
            { playerId: "lottery", positions: ["PG"] },
            { playerId: "udfa", positions: ["PG"] },
            { playerId: "g1", positions: ["PG"] },
            { playerId: "g2", positions: ["SG"] },
            { playerId: "g3", positions: ["PG"] },
            { playerId: "w1", positions: ["SF"] },
            { playerId: "w2", positions: ["SF"] },
            { playerId: "w3", positions: ["SF"] },
            { playerId: "b1", positions: ["C"] },
            { playerId: "b2", positions: ["PF"] },
            { playerId: "b3", positions: ["C"] }
          ],
          departed: []
        }
      ],
      [
        { playerId: "lottery", name: "Lottery", positions: ["PG"], age: 19, draftSlot: 1 },
        { playerId: "udfa", name: "UDFA", positions: ["PG"], age: 22, draftSlot: null }
      ]
    )

    const lottery = out.find((row) => row.playerId === "lottery")
    const udfa = out.find((row) => row.playerId === "udfa")
    expect(lottery?.usg).toBeDefined()
    expect(udfa?.usg).toBeDefined()
    expect(lottery!.usg).toBeGreaterThan(udfa!.usg)
    expect(lottery!.usg).toBeGreaterThan(20)
  })
})
