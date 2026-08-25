import { describe, expect, it } from "vitest"
import { buildMatchupBoard } from "@/lib/matchup/board"
import { MAX_RATIO_SITS } from "@/lib/matchup/constants"
import {
  youTotalsFromDaily,
  type DailyLineups,
} from "@/lib/matchup/dailyLineups"
import { suggestRatioSits } from "@/lib/matchup/ratioSits"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const twoDaySchedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-04",
    days: ["2025-11-03", "2025-11-04"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
  ],
}

const star: SeasonPlayer = {
  id: "star",
  name: "Star",
  teamAbbr: "BOS",
  positions: ["PG"],
  projections: {
    FG_PCT: 0.55,
    FT_PCT: 0.85,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 1640,
  },
  shooting: { FGM: 900, FGA: 1640, FTM: 400, FTA: 470 },
}

const brick: SeasonPlayer = {
  id: "brick",
  name: "Brick",
  teamAbbr: "NYK",
  positions: ["SG"],
  projections: {
    FG_PCT: 0.35,
    FT_PCT: 0.6,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 410,
  },
  shooting: { FGM: 70, FGA: 200, FTM: 30, FTA: 50 },
}

const emptyDay = (): DailyLineups[string] => [
  { slot: "PG", playerId: null },
  { slot: "SG", playerId: null },
  { slot: "SF", playerId: null },
  { slot: "PF", playerId: null },
  { slot: "C", playerId: null },
  { slot: "G", playerId: null },
  { slot: "F", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "UTIL", playerId: null },
]

const ratioSitDaily = (): DailyLineups => ({
  "2025-11-03": emptyDay().map((entry, index) => {
    if (index === 0) return { ...entry, playerId: "star" }
    if (index === 1) return { ...entry, playerId: "brick" }
    return entry
  }),
  "2025-11-04": emptyDay().map((entry, index) =>
    index === 0 ? { ...entry, playerId: "star" } : entry,
  ),
})

const ratioSitPlayers = [star, brick]

const ratioSitOppTotals = (): Record<CategoryId, number> => {
  const you = youTotalsFromDaily(ratioSitDaily(), ratioSitPlayers, twoDaySchedule)
  return {
    FG_PCT: 0.54,
    FT_PCT: you.FT_PCT - 0.01,
    TPM: you.TPM + 100,
    REB: you.REB + 100,
    AST: you.AST + 100,
    STL: you.STL + 100,
    BLK: you.BLK + 100,
    TO: you.TO + 100,
    PTS: 34,
  }
}

const assertBaselineBoard = (
  oppTotals: Record<CategoryId, number>,
  categoryIds: CategoryId[] = ALL_CATEGORY_IDS,
) => {
  const you = youTotalsFromDaily(ratioSitDaily(), ratioSitPlayers, twoDaySchedule)
  const board = buildMatchupBoard(you, oppTotals, categoryIds)
  const byCat = Object.fromEntries(
    board.categories.map((row) => [row.categoryId, row.outcome]),
  )
  expect(byCat.FG_PCT).toBe("L")
  expect(byCat.PTS).toBe("W")
  return board
}

describe("suggestRatioSits", () => {
  it("suggests sitting the brick on day1 for FG% while preserving PTS W", () => {
    const oppTotals = ratioSitOppTotals()
    assertBaselineBoard(oppTotals)

    const suggestions = suggestRatioSits({
      daily: ratioSitDaily(),
      players: ratioSitPlayers,
      schedule: twoDaySchedule,
      oppTotals,
      categoryIds: ALL_CATEGORY_IDS,
    })

    const brickDay1 = suggestions.find(
      (suggestion) =>
        suggestion.playerId === "brick" && suggestion.date === "2025-11-03",
    )
    expect(brickDay1).toBeDefined()
    expect(brickDay1?.targetCategoryId).toBe("FG_PCT")
    expect(brickDay1?.deltaWinProb).toBeGreaterThan(0)
    expect(brickDay1?.reason).toMatch(/FG%/)
    expect(brickDay1?.reason).toMatch(/counting W preserved/)
  })

  it("does not suggest sitting the star when it would flip PTS W to L", () => {
    const oppTotals = ratioSitOppTotals()
    assertBaselineBoard(oppTotals)

    const suggestions = suggestRatioSits({
      daily: ratioSitDaily(),
      players: ratioSitPlayers,
      schedule: twoDaySchedule,
      oppTotals,
      categoryIds: ALL_CATEGORY_IDS,
    })

    expect(
      suggestions.some(
        (suggestion) =>
          suggestion.playerId === "star" && suggestion.date === "2025-11-03",
      ),
    ).toBe(false)
  })

  it("returns empty when baseline FG%, FT%, and TO are all W", () => {
    const daily = ratioSitDaily()
    const you = youTotalsFromDaily(daily, ratioSitPlayers, twoDaySchedule)
    const oppTotals: Record<CategoryId, number> = {
      ...you,
      FG_PCT: you.FG_PCT - 0.05,
      FT_PCT: you.FT_PCT - 0.05,
      TO: you.TO + 50,
    }
    const board = buildMatchupBoard(you, oppTotals, ALL_CATEGORY_IDS)
    const byCat = Object.fromEntries(
      board.categories.map((row) => [row.categoryId, row.outcome]),
    )
    expect(byCat.FG_PCT).toBe("W")
    expect(byCat.FT_PCT).toBe("W")
    expect(byCat.TO).toBe("W")

    const suggestions = suggestRatioSits({
      daily,
      players: ratioSitPlayers,
      schedule: twoDaySchedule,
      oppTotals,
      categoryIds: ALL_CATEGORY_IDS,
    })

    expect(suggestions).toEqual([])
  })

  it("returns at most MAX_RATIO_SITS suggestions", () => {
    const oppTotals = ratioSitOppTotals()
    const suggestions = suggestRatioSits({
      daily: ratioSitDaily(),
      players: ratioSitPlayers,
      schedule: twoDaySchedule,
      oppTotals,
      categoryIds: ALL_CATEGORY_IDS,
    })

    expect(suggestions.length).toBeLessThanOrEqual(MAX_RATIO_SITS)
  })
})
