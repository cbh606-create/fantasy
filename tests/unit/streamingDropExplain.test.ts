import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { buildMatchupBoard } from "@/lib/matchup/board"
import {
  formatHelpsCatsLine,
  formatSuggestedDropTooltip,
  isContestedCategoryRow,
  suggestStreamingDrop,
  targetCategoryIdsFromBoards,
} from "@/lib/matchup/streamingDropExplain"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type { MatchupBoard, MatchupCategoryRow } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const row = (
  categoryId: MatchupCategoryRow["categoryId"],
  outcome: MatchupCategoryRow["outcome"],
  winProb: number,
): MatchupCategoryRow => ({
  categoryId,
  you: 1,
  opp: 1,
  outcome,
  winProb,
})

const baseProjections = (): SeasonPlayer["projections"] => ({
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
})

const baseShooting = (): SeasonPlayer["shooting"] => ({
  FGM: 500,
  FGA: 1040,
  FTM: 200,
  FTA: 260,
})

const player = (
  id: string,
  teamAbbr: string,
  overrides: Partial<SeasonPlayer> = {},
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  projections: { ...baseProjections(), ...overrides.projections },
  shooting: { ...baseShooting(), ...overrides.shooting },
  ...overrides,
})

const tinySchedule = (
  days: string[],
  games: ScheduleResponse["games"],
): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    days,
  },
  games,
})

const boardLosingStl = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: categoryId === "STL" ? 1 : 10,
    opp: categoryId === "STL" ? 5 : 8,
    outcome: categoryId === "STL" ? "L" : "W",
    winProb: categoryId === "STL" ? 0.2 : 0.8,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
})

describe("streamingDropExplain", () => {
  it("treats L, T, and fragile W as contested", () => {
    expect(isContestedCategoryRow(row("STL", "L", 0.2))).toBe(true)
    expect(isContestedCategoryRow(row("BLK", "T", 0.5))).toBe(true)
    expect(isContestedCategoryRow(row("PTS", "W", 0.64))).toBe(true)
    expect(isContestedCategoryRow(row("REB", "W", 0.65))).toBe(false)
  })

  it("picks up to 3 hunted cats and skips blowout wins", () => {
    const before = buildMatchupBoard(
      {
        FG_PCT: 0.5,
        FT_PCT: 0.8,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 2,
        BLK: 2,
        TO: 10,
        PTS: 100,
      },
      {
        FG_PCT: 0.49,
        FT_PCT: 0.79,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 8,
        BLK: 8,
        TO: 10,
        PTS: 100,
      },
      ALL_CATEGORY_IDS,
    )
    const after = buildMatchupBoard(
      {
        FG_PCT: 0.55,
        FT_PCT: 0.8,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 9,
        BLK: 9,
        TO: 10,
        PTS: 100,
      },
      {
        FG_PCT: 0.49,
        FT_PCT: 0.79,
        TPM: 10,
        REB: 40,
        AST: 20,
        STL: 8,
        BLK: 8,
        TO: 10,
        PTS: 100,
      },
      ALL_CATEGORY_IDS,
    )
    expect(targetCategoryIdsFromBoards(before, after)).toEqual(["STL", "BLK"])
  })

  it("formats tooltip and helps line with short labels", () => {
    expect(formatSuggestedDropTooltip("Roster Cut", ["STL", "BLK"])).toBe(
      "Suggested drop: Roster Cut — weakest for STL, BLK",
    )
    expect(formatHelpsCatsLine(["STL", "BLK"])).toBe("Helps STL, BLK")
  })

  it("omits weakest-for suffix when categoryIds is empty", () => {
    expect(formatSuggestedDropTooltip("Roster Cut", [])).toBe(
      "Suggested drop: Roster Cut",
    )
    expect(formatSuggestedDropTooltip("Roster Cut", [])).not.toMatch(
      /weakest for\s*$/,
    )
  })

  it("suggests dropping the low-STL roster player on a board losing STL", () => {
    const fromDate = "2025-11-03"
    const highStl = player("high-stl", "BOS", {
      projections: { ...baseProjections(), STL: 180 },
    })
    const lowStl = player("low-stl", "NYK", {
      projections: { ...baseProjections(), STL: 10 },
    })
    const workingDaily: DailyLineups = {
      [fromDate]: [
        { slot: "UTIL", playerId: highStl.id },
        { slot: "UTIL", playerId: lowStl.id },
      ],
    }
    const schedule = tinySchedule([fromDate], [
      { date: fromDate, homeAbbr: "BOS", awayAbbr: "CHI" },
      { date: fromDate, homeAbbr: "NYK", awayAbbr: "CHI" },
    ])

    const suggestion = suggestStreamingDrop({
      rosterPlayerIds: [highStl.id, lowStl.id],
      players: [highStl, lowStl],
      workingDaily,
      fromDate,
      schedule,
      board: boardLosingStl(),
    })

    expect(suggestion).toEqual({
      playerId: lowStl.id,
      categoryIds: ["STL"],
    })
  })

  it("picks a low-FG% player when removing them raises contested winProb", () => {
    const fromDate = "2025-11-03"
    const brick = player("brick", "BOS", {
      projections: { ...baseProjections(), PTS: 2000 },
      shooting: { FGM: 1, FGA: 80, FTM: 1, FTA: 1 },
    })
    const good = player("good", "NYK", {
      projections: { ...baseProjections(), PTS: 1400 },
      shooting: { FGM: 46, FGA: 100, FTM: 20, FTA: 25 },
    })
    const scrub = player("scrub", "CHI", {
      projections: { ...baseProjections(), PTS: 10 },
      shooting: { FGM: 5, FGA: 10, FTM: 1, FTA: 1 },
    })
    const workingDaily: DailyLineups = {
      [fromDate]: [
        { slot: "UTIL", playerId: brick.id },
        { slot: "UTIL", playerId: good.id },
      ],
    }
    const schedule = tinySchedule([fromDate], [
      { date: fromDate, homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: fromDate, homeAbbr: "NYK", awayAbbr: "ORL" },
    ])
    const passedBoard: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "FG_PCT" ? 0.46 : 10,
        opp: categoryId === "FG_PCT" ? 0.45 : 8,
        outcome: categoryId === "FG_PCT" ? "W" : "W",
        winProb: categoryId === "FG_PCT" ? 0.64 : 0.9,
      })),
      wins: 9,
      losses: 0,
      ties: 0,
      projectedCatWins: 8,
    }

    const suggestion = suggestStreamingDrop({
      rosterPlayerIds: [brick.id, scrub.id],
      players: [brick, good, scrub],
      workingDaily,
      fromDate,
      schedule,
      board: passedBoard,
    })

    expect(suggestion?.playerId).toBe(brick.id)
  })
})
