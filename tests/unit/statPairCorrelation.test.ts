import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import {
  MIN_PAIR_ROWS,
  buildStatPairRows,
  observationsForStatPairs,
  pairPenalty,
  perGameObservation,
} from "@/lib/players/statPairCorrelation"

const totals = (pts: number, assists: number, turnovers: number): Record<CategoryId, number> => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 0,
  REB: 0,
  AST: assists,
  STL: 0,
  BLK: 0,
  TO: turnovers,
  PTS: pts,
})

const counted = (count: number, fill: (index: number) => ReturnType<typeof perGameObservation>) =>
  Array.from({ length: count }, (_, index) => fill(index))

describe("pairPenalty", () => {
  it("charges 0.075 when r is -0.5", () => {
    expect(pairPenalty(-0.5)).toBeCloseTo(0.075)
  })

  it("charges nothing when r is zero or positive", () => {
    expect(pairPenalty(0)).toBe(0)
    expect(pairPenalty(0.4)).toBe(0)
  })

  it("charges nothing when the pair is unmeasured", () => {
    expect(pairPenalty(-0.5, false)).toBe(0)
  })
})

describe("observationsForStatPairs", () => {
  it("keeps one row per season for the same player", () => {
    const rows = observationsForStatPairs({
      lastSeason: [{ projectedGames: 70, projections: totals(1400, 700, 210) }],
      currentSeason: [{
        seasonRates: {
          gamesPlayed: 30,
          projections: totals(20, 10, 3),
          shooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
        },
      }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].projections.PTS).toBeCloseTo(20)
    expect(rows[1].projections.PTS).toBeCloseTo(20)
  })

  it("uses only last season when this season has no actuals", () => {
    const rows = observationsForStatPairs({
      lastSeason: [{ projectedGames: 70, projections: totals(1400, 700, 210) }],
      currentSeason: [{}],
    })
    expect(rows).toHaveLength(1)
  })

  it("drops a season under 20 games", () => {
    const rows = observationsForStatPairs({
      lastSeason: [{ projectedGames: 12, projections: totals(240, 120, 36) }],
      currentSeason: [],
    })
    expect(rows).toHaveLength(0)
  })
})

describe("buildStatPairRows", () => {
  it("negates turnovers and correlates them against assists", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, totals(20 * 40, (index + 1) * 40, (index + 1) * 40)),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "AST" && row.categoryB === "TO",
    )
    expect(pair?.measured).toBe(true)
    expect(pair?.r).toBeCloseTo(-1)
    expect(pair?.penalty).toBeCloseTo(0.15)
  })

  it("leaves a positive pair unpenalized", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, {
        ...totals((index + 1) * 40, 0, 0),
        TPM: (index + 1) * 40,
      }),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "TPM" && row.categoryB === "PTS",
    )
    expect(pair?.r).toBeCloseTo(1)
    expect(pair?.penalty).toBe(0)
  })

  it("drops a percentage with zero attempts and keeps the other categories", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(
        40,
        totals((index + 1) * 40, (index + 2) * 40, 40),
        { FGM: 0, FGA: 0, FTM: 4 * 40, FTA: 5 * 40 },
      ),
    )
    const fg = buildStatPairRows(observations).find((row) => row.categoryA === "FG_PCT")
    const ft = buildStatPairRows(observations).find(
      (row) => row.categoryA === "FT_PCT" && row.categoryB === "PTS",
    )
    expect(fg?.measured).toBe(false)
    expect(fg?.n).toBe(0)
    expect(ft?.n).toBe(MIN_PAIR_ROWS)
  })

  it("keeps a finite percentage when shooting is missing", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, {
        ...totals((index + 1) * 40, 40, 40),
        FG_PCT: 0.4 + index * 0.001,
      }),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "FG_PCT" && row.categoryB === "PTS",
    )
    expect(pair?.n).toBe(MIN_PAIR_ROWS)
    expect(pair?.measured).toBe(true)
  })

  it("returns an unmeasured pair below 40 rows", () => {
    const observations = counted(10, (index) =>
      perGameObservation(40, totals((index + 1) * 40, (index + 1) * 40, 40)),
    )
    const pair = buildStatPairRows(observations).find(
      (row) => row.categoryA === "AST" && row.categoryB === "PTS",
    )
    expect(pair).toMatchObject({ r: 0, penalty: 0, n: 10, measured: false })
  })

  it("returns 36 pairs with measured rows before unmeasured rows", () => {
    const observations = counted(MIN_PAIR_ROWS, (index) =>
      perGameObservation(40, totals((index + 1) * 40, (index + 1) * 40, 40)),
    )
    const rows = buildStatPairRows(observations)
    expect(rows).toHaveLength(36)
    const astPts = rows.find((row) => row.categoryA === "AST" && row.categoryB === "PTS")
    expect(astPts?.measured).toBe(true)
    expect(astPts?.n).toBe(MIN_PAIR_ROWS)
    const rebStl = rows.find((row) => row.categoryA === "REB" && row.categoryB === "STL")
    expect(rebStl).toMatchObject({ r: 0, penalty: 0, measured: false, n: MIN_PAIR_ROWS })
    const firstUnmeasured = rows.findIndex((row) => !row.measured)
    const lastMeasured = rows.findLastIndex((row) => row.measured)
    expect(firstUnmeasured).toBeGreaterThan(lastMeasured)
    const measured = rows.filter((row) => row.measured)
    const sorted = [...measured].sort((a, b) => a.r - b.r || `${a.categoryA}|${a.categoryB}`.localeCompare(`${b.categoryA}|${b.categoryB}`))
    expect(measured.map((row) => row.r)).toEqual(sorted.map((row) => row.r))
  })

  it("returns no rows when nobody qualifies", () => {
    expect(buildStatPairRows([])).toEqual([])
  })
})
