import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"
import {
  createRng,
  pickOpponentPlayer,
  scoreOpponentNeed,
} from "@/lib/sim/opponent"

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
  positions: Player["positions"],
  adp: number,
  categoryOverrides: Partial<Record<CategoryId, number>> = {},
): Player => ({
  id,
  name: id,
  positions,
  projections: projections(categoryOverrides),
  adp,
})

const weights = (
  overrides: Partial<Record<CategoryId, number>> = {},
): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [
      categoryId,
      overrides[categoryId] ?? 0,
    ]),
  ) as Record<CategoryId, number>

describe("createRng", () => {
  it("produces a repeatable mulberry32 sequence", () => {
    const first = createRng(1)
    const second = createRng(1)

    expect([first(), first(), first()]).toEqual([
      second(),
      second(),
      second(),
    ])
    expect(createRng(1)()).toBeCloseTo(0.6270739405881613)
  })
})

describe("scoreOpponentNeed", () => {
  it("combines ADP, an unfilled primary position, and category needs", () => {
    const roster = [
      player("center", ["C"], 20, { PTS: 10, TO: 4 }),
    ]
    const candidate = player("guard", ["PG"], 10, { PTS: 15, TO: 2 })

    expect(
      scoreOpponentNeed(candidate, roster, weights({ PTS: 1, TO: 1 })),
    ).toBe(67)
  })

  it("prefers a missing PG after all center starter fits are occupied", () => {
    const roster = [
      player("center-1", ["C"], 1),
      player("center-2", ["C"], 2),
      player("center-3", ["C"], 3),
    ]
    const pointGuard = player("point-guard", ["PG"], 10)
    const center = player("center-4", ["C"], 10)

    expect(
      scoreOpponentNeed(pointGuard, roster, weights()),
    ).toBeGreaterThan(scoreOpponentNeed(center, roster, weights()))
  })
})

describe("pickOpponentPlayer", () => {
  it("uses the supplied RNG to make a deterministic weighted pick", () => {
    const remaining = [
      player("first", ["PG"], 1),
      player("second", ["SG"], 2),
      player("third", ["SF"], 3),
    ]

    const picked = pickOpponentPlayer(remaining, [], weights(), () => 0.6)

    expect(picked.id).toBe("second")
  })
})
