import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"
import {
  categoryFillBonus,
  createRng,
  MOCK_ADP_WINDOW,
  pickLiveCpuByAdp,
  pickMockCpu,
  pickSimOpponent,
  scoreOpponentNeed,
  scoreSimOpponent,
  SIM_ADP_WINDOW,
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
    const leagueAverage = projections({ PTS: 12, TO: 3 })

    expect(
      scoreOpponentNeed(
        candidate,
        roster,
        weights({ PTS: 1, TO: 1 }),
        leagueAverage,
      ),
    ).toBe(63)
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
      scoreOpponentNeed(pointGuard, roster, weights(), projections()),
    ).toBeGreaterThan(
      scoreOpponentNeed(center, roster, weights(), projections()),
    )
  })

  it("adds 25 when the player improves a flexible starter fit", () => {
    const roster = [player("point-guard", ["PG"], 1)]
    const candidate = player("combo-guard", ["PG", "SG"], 10)

    expect(
      scoreOpponentNeed(candidate, roster, weights(), projections()),
    ).toBe(35)
  })

  it("adds no position bonus when the player cannot improve starter fits", () => {
    const roster = [
      player("point-guard-1", ["PG"], 1),
      player("point-guard-2", ["PG"], 2),
      player("point-guard-3", ["PG"], 3),
      player("point-guard-4", ["PG"], 4),
    ]
    const candidate = player("point-guard-5", ["PG"], 10)

    expect(
      scoreOpponentNeed(candidate, roster, weights(), projections()),
    ).toBe(10)
  })
})

describe("pickLiveCpuByAdp", () => {
  it("always takes the best remaining ADP", () => {
    const remaining = [
      player("first", ["PG"], 12),
      player("second", ["SG"], 3),
      player("third", ["SF"], 40),
    ]

    expect(pickLiveCpuByAdp(remaining, () => 0.6).id).toBe("second")
  })

  it("breaks ADP ties with the supplied RNG", () => {
    const remaining = [
      player("alpha", ["PG"], 5),
      player("beta", ["SG"], 5),
      player("gamma", ["SF"], 20),
    ]

    expect(pickLiveCpuByAdp(remaining, () => 0).id).toBe("alpha")
    expect(pickLiveCpuByAdp(remaining, () => 0.99).id).toBe("beta")
  })
})

describe("scoreSimOpponent", () => {
  it("combines ADP weight and position need without category bonus", () => {
    const roster = [player("center", ["C"], 20)]
    const guard = player("guard", ["PG"], 10)

    expect(scoreSimOpponent(guard, roster)).toBe(60)
  })
})

describe("pickSimOpponent", () => {
  it("never selects outside the ADP top window", () => {
    const remaining = Array.from({ length: SIM_ADP_WINDOW + 2 }, (_, index) =>
      player(`p${index + 1}`, ["PG"], index + 1),
    )
    const picked = pickSimOpponent(remaining, [], () => 0.999999)

    expect(picked.adp).toBeLessThanOrEqual(SIM_ADP_WINDOW)
    expect(picked.id).not.toBe("p9")
    expect(picked.id).not.toBe("p10")
  })

  it("can prefer a position fit inside the window over a slightly better ADP", () => {
    const remaining = [
      player("star-c", ["C"], 1),
      player("fit-pg", ["PG"], 2),
    ]
    const roster = [
      player("c1", ["C"], 40),
      player("c2", ["C"], 41),
      player("c3", ["C"], 42),
    ]

    expect(pickSimOpponent(remaining, roster, () => 0.75).id).toBe("fit-pg")
  })
})

describe("categoryFillBonus", () => {
  it("rewards candidates that cover lagging categories", () => {
    const roster = [player("scorer", ["SG"], 20, { PTS: 30, REB: 2 })]
    const baseline = projections({ PTS: 15, REB: 8 })
    const rebounder = player("board-man", ["PF"], 10, { PTS: 8, REB: 14 })
    const moreScoring = player("scorer-2", ["SG"], 10, { PTS: 28, REB: 2 })

    expect(categoryFillBonus(rebounder, roster, baseline)).toBeGreaterThan(
      categoryFillBonus(moreScoring, roster, baseline),
    )
  })
})

describe("pickMockCpu", () => {
  it("never selects outside the mock ADP top window", () => {
    const remaining = Array.from({ length: MOCK_ADP_WINDOW + 3 }, (_, index) =>
      player(`p${index + 1}`, ["PG"], index + 1),
    )
    const picked = pickMockCpu(remaining, [], () => 0.999999)

    expect(picked.adp).toBeLessThanOrEqual(MOCK_ADP_WINDOW)
    expect(picked.id).not.toBe("p6")
    expect(picked.id).not.toBe("p7")
  })

  it("can prefer a category fit inside the window over pure ADP", () => {
    const remaining = [
      player("adp1", ["C"], 1, { REB: 2, PTS: 20 }),
      player("adp2", ["C"], 2, { REB: 2, PTS: 19 }),
      player("adp3", ["PF"], 3, { REB: 14, PTS: 12 }),
      player("adp4", ["C"], 4, { REB: 2, PTS: 18 }),
      player("adp5", ["C"], 5, { REB: 2, PTS: 17 }),
    ]
    const roster = [player("guard", ["PG"], 40, { REB: 1, PTS: 22 })]

    expect(pickMockCpu(remaining, roster, () => 0.55).id).toBe("adp3")
  })
})
