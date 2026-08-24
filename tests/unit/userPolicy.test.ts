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
