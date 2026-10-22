import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import { emptyCategoryTotals } from "@/lib/matchup/morningCheck"
import { actualMinusProjection, weekAdvantage } from "@/lib/matchup/projectionDelta"
import type { ProjectionActualPart } from "@/lib/matchup/projectionDelta"

const totals = (overrides: Partial<Record<CategoryId, number>> = {}) => ({
  ...emptyCategoryTotals(),
  ...overrides,
})

const part = (
  overrides: Partial<ProjectionActualPart> = {},
): ProjectionActualPart => ({
  projection: totals(),
  actual: null,
  ...overrides,
})

describe("actualMinusProjection", () => {
  it("returns null when no day has a box", () => {
    expect(
      actualMinusProjection([
        part({ projection: totals({ PTS: 20 }) }),
        part({
          projection: totals({ PTS: 12 }),
          actual: totals(),
          actualShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
        }),
      ]),
    ).toBeNull()
  })

  it("sums counting stats for boxed days and skips projection-only days", () => {
    const delta = actualMinusProjection([
      part({
        projection: totals({ PTS: 20, REB: 8, TO: 3 }),
        projectionShooting: { FGM: 8, FGA: 10, FTM: 4, FTA: 4 },
        actual: totals({ PTS: 18, REB: 11, TO: 5 }),
        actualShooting: { FGM: 4, FGA: 10, FTM: 2, FTA: 4 },
        playedIds: ["a"],
      }),
      part({
        projection: totals({ PTS: 100, REB: 40, TO: 9 }),
        actual: null,
      }),
      part({
        projection: totals({ PTS: 10, REB: 4, TO: 1 }),
        projectionShooting: { FGM: 1, FGA: 10, FTM: 1, FTA: 2 },
        actual: totals({ PTS: 15, REB: 2, TO: 1 }),
        actualShooting: { FGM: 9, FGA: 10, FTM: 3, FTA: 4 },
        playedIds: ["b"],
      }),
    ])

    expect(delta?.PTS).toBe((18 - 20) + (15 - 10))
    expect(delta?.REB).toBe((11 - 8) + (2 - 4))
    expect(delta?.TO).toBe((5 - 3) + (1 - 1))
  })

  it("aggregates FG% and FT% from makes and attempts, not summed percentages", () => {
    const delta = actualMinusProjection([
      part({
        projection: totals({ FG_PCT: 0.8, FT_PCT: 1 }),
        projectionShooting: { FGM: 8, FGA: 10, FTM: 4, FTA: 4 },
        actual: totals({ FG_PCT: 0.4, FT_PCT: 0.5 }),
        actualShooting: { FGM: 4, FGA: 10, FTM: 2, FTA: 4 },
        playedIds: ["a"],
      }),
      part({
        projection: totals({ FG_PCT: 0.1, FT_PCT: 0.5 }),
        projectionShooting: { FGM: 1, FGA: 10, FTM: 1, FTA: 2 },
        actual: totals({ FG_PCT: 0.9, FT_PCT: 0.75 }),
        actualShooting: { FGM: 9, FGA: 10, FTM: 3, FTA: 4 },
        playedIds: ["b"],
      }),
    ])

    const summedFgGaps = (0.4 - 0.8) + (0.9 - 0.1)
    expect(delta?.FG_PCT).toBeCloseTo((4 + 9) / (10 + 10) - (8 + 1) / (10 + 10))
    expect(delta?.FG_PCT).not.toBeCloseTo(summedFgGaps)
    expect(delta?.FT_PCT).toBeCloseTo((2 + 3) / (4 + 4) - (4 + 1) / (4 + 2))
  })

  it("prefers shooting volume over the stored percentage", () => {
    const delta = actualMinusProjection([
      part({
        projection: totals({ FG_PCT: 0.99, FT_PCT: 0.99 }),
        projectionShooting: { FGM: 5, FGA: 10, FTM: 8, FTA: 10 },
        actual: totals({ FG_PCT: 0.01, FT_PCT: 0.01 }),
        actualShooting: { FGM: 4, FGA: 8, FTM: 3, FTA: 6 },
        playedIds: ["p1"],
      }),
    ])

    expect(delta?.FG_PCT).toBeCloseTo(4 / 8 - 5 / 10)
    expect(delta?.FT_PCT).toBeCloseTo(3 / 6 - 8 / 10)
  })

  it("counts a played zero line and ignores a closed day with no box", () => {
    const delta = actualMinusProjection([
      part({
        projection: totals({ PTS: 12 }),
        projectionShooting: { FGM: 4, FGA: 10, FTM: 2, FTA: 2 },
        actual: totals(),
        actualShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
        playedIds: ["sat-zero"],
      }),
      part({
        projection: totals({ PTS: 50 }),
        actual: totals(),
        actualShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      }),
    ])

    expect(delta?.PTS).toBe(-12)
    expect(delta?.FG_PCT).toBeCloseTo(0 - 4 / 10)
  })

  it("uses stored percentages for one boxed day that has no shooting", () => {
    const delta = actualMinusProjection([
      part({
        projection: totals({ FG_PCT: 0.5, FT_PCT: 0.8, PTS: 10 }),
        actual: totals({ FG_PCT: 0.4, FT_PCT: 0.7, PTS: 12 }),
        playedIds: ["a"],
      }),
    ])

    expect(delta?.PTS).toBe(2)
    expect(delta?.FG_PCT).toBeCloseTo(-0.1)
    expect(delta?.FT_PCT).toBeCloseTo(-0.1)
  })

  it("does not sum FG% gaps when several days lack shooting", () => {
    const delta = actualMinusProjection([
      part({
        projection: totals({ FG_PCT: 0.5, PTS: 10 }),
        actual: totals({ FG_PCT: 0.4, PTS: 12 }),
        playedIds: ["a"],
      }),
      part({
        projection: totals({ FG_PCT: 0.5, PTS: 10 }),
        actual: totals({ FG_PCT: 0.8, PTS: 11 }),
        playedIds: ["b"],
      }),
    ])

    expect(delta?.PTS).toBe(3)
    expect(delta?.FG_PCT).toBeNaN()
    expect(delta?.FT_PCT).toBeNaN()
  })
})

describe("weekAdvantage", () => {
  it("flips turnovers so a positive advantage means we are ahead", () => {
    const advantage = weekAdvantage(
      totals({ PTS: 4, TO: -2, FG_PCT: 0.02 }),
      totals({ PTS: 1, TO: 3, FG_PCT: -0.01 }),
    )

    expect(advantage?.PTS).toBe(3)
    expect(advantage?.TO).toBe(5)
    expect(advantage?.FG_PCT).toBeCloseTo(0.03)
  })

  it("returns null when either team has no delta", () => {
    expect(weekAdvantage(totals({ PTS: 4 }), null)).toBeNull()
    expect(weekAdvantage(null, totals({ PTS: 1 }))).toBeNull()
  })

  it("leaves a category blank when either delta is not finite", () => {
    const advantage = weekAdvantage(
      totals({ PTS: 4, FG_PCT: Number.NaN }),
      totals({ PTS: 1, FG_PCT: 0.01 }),
    )

    expect(advantage?.PTS).toBe(3)
    expect(advantage?.FG_PCT).toBeNaN()
  })
})
