import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"
import {
  evaluateForcePick,
  greedyUserPick,
} from "@/lib/sim/userPolicy"

const projections = (
  overrides: Partial<Record<CategoryId, number>> = {},
): Record<CategoryId, number> => ({
  FG_PCT: 0,
  FT_PCT: 0,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
  ...overrides,
})

const player = (
  id: string,
  categoryOverrides: Partial<Record<CategoryId, number>>,
  adp = 1,
): Player => ({
  id,
  name: id,
  positions: ["PG"],
  projections: projections(categoryOverrides),
  adp,
})

const weights = (
  overrides: Partial<Record<CategoryId, number>>,
): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [
      categoryId,
      overrides[categoryId] ?? 0,
    ]),
  ) as Record<CategoryId, number>

describe("greedyUserPick", () => {
  it("picks the higher points player when only points are weighted", () => {
    const lowPoints = player("low-points", { PTS: 10 })
    const highPoints = player("high-points", { PTS: 20 })

    const picked = greedyUserPick(
      [lowPoints, highPoints],
      [],
      [[player("baseline-low", { PTS: 5 })], [player("baseline-high", { PTS: 15 })]],
      weights({ PTS: 1 }),
      () => 0,
    )

    expect(picked).toBe(highPoints)
  })
})

describe("greedyUserPick softmax", () => {
  it("usually picks the clear points leader across many draws", () => {
    const lowPoints = player("low-points", { PTS: 10 })
    const highPoints = player("high-points", { PTS: 40 })
    const baselines = [
      [player("baseline-low", { PTS: 5 })],
      [player("baseline-high", { PTS: 15 })],
    ]
    const w = weights({ PTS: 1 })

    let highCount = 0
    for (let i = 0; i < 80; i += 1) {
      const rng = () => (i + 0.5) / 80
      const picked = greedyUserPick(
        [lowPoints, highPoints],
        [],
        baselines,
        w,
        rng,
      )
      if (picked.id === "high-points") highCount += 1
    }

    expect(highCount).toBeGreaterThan(60)
  })

  it("spreads picks across near-tied scorers", () => {
    // Identical talent → equal pool z + league EV; softmax should diversify.
    const a = player("a", { PTS: 20 })
    const b = player("b", { PTS: 20 })
    const c = player("c", { PTS: 20 })
    const baselines = [
      [player("baseline-low", { PTS: 5 })],
      [player("baseline-high", { PTS: 15 })],
    ]
    const w = weights({ PTS: 1 })
    const counts = new Map<string, number>()

    for (let i = 0; i < 120; i += 1) {
      const rng = () => (i + 0.5) / 120
      const picked = greedyUserPick([a, b, c], [], baselines, w, rng)
      counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1)
    }

    expect(counts.size).toBeGreaterThanOrEqual(2)
    expect(counts.get("a") ?? 0).toBeGreaterThan(0)
  })

  it("prefers stronger projection talent on an empty board, not ADP labels", () => {
    // Same fantasy "rank labels" would be wrong; projections differ like the real pool.
    const jokic = player(
      "jokic",
      {
        FG_PCT: 0.58,
        FT_PCT: 0.83,
        TPM: 130,
        REB: 940,
        AST: 747,
        STL: 100,
        BLK: 60,
        TO: 250,
        PTS: 2144,
      },
      50, // deliberately poor ADP — talent score should still win
    )
    const durant = player(
      "durant",
      {
        FG_PCT: 0.5,
        FT_PCT: 0.85,
        TPM: 140,
        REB: 400,
        AST: 300,
        STL: 60,
        BLK: 70,
        TO: 200,
        PTS: 1693,
      },
      1,
    )
    const filler = Array.from({ length: 20 }, (_, index) =>
      player(`filler-${index}`, {
        FG_PCT: 0.45,
        FT_PCT: 0.75,
        TPM: 80,
        REB: 300,
        AST: 200,
        STL: 50,
        BLK: 30,
        TO: 150,
        PTS: 900,
      }),
    )
    const emptyLeague = Array.from({ length: 12 }, () => [] as Player[])
    const w = Object.fromEntries(
      ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 1]),
    ) as Record<CategoryId, number>

    const counts = new Map<string, number>()
    for (let i = 0; i < 60; i += 1) {
      const rng = () => (i + 0.5) / 60
      const picked = greedyUserPick(
        [durant, jokic, ...filler],
        [],
        emptyLeague,
        w,
        rng,
      )
      counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1)
    }

    expect(counts.get("jokic") ?? 0).toBeGreaterThan(45)
    expect(counts.get("durant") ?? 0).toBeLessThan(10)
  })
})

describe("greedyUserPick position need", () => {
  it("prefers uncovered primary position when projections are equal", () => {
    const sameStats = {
      FG_PCT: 0.5, FT_PCT: 0.8, TPM: 100, REB: 400, AST: 300,
      STL: 50, BLK: 50, TO: 150, PTS: 1200,
    }
    const needPg = player("need-pg", sameStats, 10)
    needPg.positions = ["PG"]
    const extraC = player("extra-c", sameStats, 10)
    extraC.positions = ["C"]
    const roster = [player("have-c", sameStats, 10)]
    roster[0].positions = ["C"]
    const emptyOthers = Array.from({ length: 11 }, () => [] as Player[])
    const allRosters = [roster, ...emptyOthers]
    const w = Object.fromEntries(ALL_CATEGORY_IDS.map((id) => [id, 1])) as Record<CategoryId, number>

    const picked = greedyUserPick(
      [extraC, needPg],
      roster,
      allRosters,
      w,
      () => 0,
    )
    expect(picked.id).toBe("need-pg")
  })
})

describe("greedyUserPick punt", () => {
  it("ignores punt category when ranking specialists", () => {
    const rebGod = player("reb-god", { REB: 900, PTS: 800, STL: 40 }, 20)
    const stlGod = player("stl-god", { REB: 300, PTS: 800, STL: 120 }, 20)
    const fillers = Array.from({ length: 15 }, (_, i) =>
      player(`f${i}`, { REB: 300, PTS: 700, STL: 50 }, 40 + i),
    )
    const emptyLeague = Array.from({ length: 12 }, () => [] as Player[])
    const puntReb = Object.fromEntries(
      ALL_CATEGORY_IDS.map((id) => [id, id === "REB" ? 0 : 1]),
    ) as Record<CategoryId, number>

    const picked = greedyUserPick(
      [rebGod, stlGod, ...fillers],
      [],
      emptyLeague,
      puntReb,
      () => 0,
    )
    expect(picked.id).toBe("stl-god")
  })
})

describe("evaluateForcePick", () => {
  it("places the forced player first in the returned path", () => {
    const forcedPlayer = player("forced", { PTS: 10 })
    const otherPlayer = player("other", { PTS: 20 })

    const result = evaluateForcePick(
      forcedPlayer,
      [forcedPlayer, otherPlayer],
      [],
      [[player("baseline-low", { PTS: 5 })], [player("baseline-high", { PTS: 15 })]],
      weights({ PTS: 1 }),
      () => 0,
    )

    expect(result.player).toBe(forcedPlayer)
    expect(result.path[0]).toBe(forcedPlayer)
  })
})
