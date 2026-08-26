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
): Player => ({
  id,
  name: id,
  positions: ["PG"],
  projections: projections(categoryOverrides),
  adp: 1,
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
    const a = player("a", { PTS: 20 })
    const b = player("b", { PTS: 19.5 })
    const c = player("c", { PTS: 19 })
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
