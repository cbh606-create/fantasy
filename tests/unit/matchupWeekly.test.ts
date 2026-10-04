import { describe, expect, it } from "vitest"
import { gamesThisWeekByPlayerId } from "@/lib/matchup/games"
import { weeklyPlayerStats, activeTeamWeeklyTotals } from "@/lib/matchup/weekly"
import { ASSUMED_SEASON_GAMES } from "@/lib/matchup/constants"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-09",
    days: ["2025-11-03", "2025-11-04", "2025-11-05"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
  ],
}

describe("gamesThisWeekByPlayerId", () => {
  it("counts distinct game days for teamAbbr; missing abbr → 0", () => {
    const players: SeasonPlayer[] = [
      {
        id: "a",
        name: "A",
        teamAbbr: "BOS",
        projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 82, REB: 400, AST: 400, STL: 80, BLK: 40, TO: 200, PTS: 1640 },
        shooting: { FGM: 500, FGA: 1000, FTM: 200, FTA: 250 },
      },
      {
        id: "b",
        name: "B",
        projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0 },
        shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      },
    ]
    const map = gamesThisWeekByPlayerId(players, schedule)
    expect(map.get("a")).toBe(2)
    expect(map.get("b")).toBe(0)
  })
})

describe("weeklyPlayerStats", () => {
  it("scales season-total PTS by games/82", () => {
    const player: SeasonPlayer = {
      id: "a",
      name: "A",
      teamAbbr: "BOS",
      projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 82, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 1640 },
      shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
    }
    const weekly = weeklyPlayerStats(player, 2)
    expect(weekly.projections.PTS).toBeCloseTo((1640 / ASSUMED_SEASON_GAMES) * 2)
    expect(weekly.projections.FG_PCT).toBeCloseTo(0.5)
  })

  it("scales ESPN-style per-game projections by games only", () => {
    const player: SeasonPlayer = {
      id: "b",
      name: "B",
      teamAbbr: "BOS",
      projections: {
        FG_PCT: 0.45,
        FT_PCT: 0.8,
        TPM: 1.6,
        REB: 5,
        AST: 4,
        STL: 1,
        BLK: 0.5,
        TO: 2,
        PTS: 18.2,
      },
      shooting: { FGM: 7, FGA: 15, FTM: 3, FTA: 3.5 },
    }
    const weekly = weeklyPlayerStats(player, 3)
    expect(weekly.projections.TPM).toBeCloseTo(1.6 * 3)
    expect(weekly.projections.PTS).toBeCloseTo(18.2 * 3)
    expect(weekly.projections.FG_PCT).toBeCloseTo(7 / 15)
  })

  it("uses last-7 per-game rates times games", () => {
    const player: SeasonPlayer = {
      id: "a",
      name: "A",
      projections: {
        FG_PCT: 0.5,
        FT_PCT: 0.8,
        TPM: 82,
        REB: 0,
        AST: 0,
        STL: 0,
        BLK: 0,
        TO: 0,
        PTS: 1640,
      },
      shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
      recentRates: {
        l7: {
          projections: {
            FG_PCT: 0.4,
            FT_PCT: 0.8,
            TPM: 3,
            REB: 1,
            AST: 1,
            STL: 1,
            BLK: 1,
            TO: 1,
            PTS: 30,
          },
          shooting: { FGM: 10, FGA: 25, FTM: 4, FTA: 5 },
        },
      },
    }
    const weekly = weeklyPlayerStats(player, 2, "l7")
    expect(weekly.projections.PTS).toBeCloseTo(60)
    expect(weekly.projections.TPM).toBeCloseTo(6)
    expect(weekly.projections.FG_PCT).toBeCloseTo(10 / 25)
  })

  it("falls back to Season when last-7 counting stats are empty", () => {
    const player: SeasonPlayer = {
      id: "a",
      name: "A",
      projections: {
        FG_PCT: 0.5,
        FT_PCT: 0.8,
        TPM: 82,
        REB: 0,
        AST: 0,
        STL: 0,
        BLK: 0,
        TO: 0,
        PTS: 1640,
      },
      shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
      recentRates: {
        l7: {
          projections: {
            FG_PCT: 0,
            FT_PCT: 0,
            TPM: 0,
            REB: 0,
            AST: 0,
            STL: 0,
            BLK: 0,
            TO: 0,
            PTS: 0,
          },
          shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
        },
      },
    }
    const season = weeklyPlayerStats(player, 2, "season")
    const l7 = weeklyPlayerStats(player, 2, "l7")
    expect(l7.projections.PTS).toBeCloseTo(season.projections.PTS)
  })

  it("falls back to Season when recentRates is missing", () => {
    const player: SeasonPlayer = {
      id: "a",
      name: "A",
      projections: {
        FG_PCT: 0.5,
        FT_PCT: 0.8,
        TPM: 82,
        REB: 0,
        AST: 0,
        STL: 0,
        BLK: 0,
        TO: 0,
        PTS: 1640,
      },
      shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
    }
    const season = weeklyPlayerStats(player, 2, "season")
    const l15 = weeklyPlayerStats(player, 2, "l15")
    expect(l15).toEqual(season)
  })
})

describe("activeTeamWeeklyTotals", () => {
  it("sums only active slots", () => {
    const activePlayer: SeasonPlayer = {
      id: "active",
      name: "Active",
      teamAbbr: "BOS",
      projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 820 },
      shooting: { FGM: 410, FGA: 820, FTM: 82, FTA: 102.5 },
    }
    const benchPlayer: SeasonPlayer = {
      id: "bench",
      name: "Bench",
      teamAbbr: "BOS",
      projections: { FG_PCT: 0.5, FT_PCT: 0.8, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 9999 },
      shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
    }
    const entries: SeasonRosterEntry[] = [
      { slot: "UTIL", playerId: "active" },
      { slot: "BE", playerId: "bench" },
    ]
    const playersById = new Map<string, SeasonPlayer>([
      ["active", activePlayer],
      ["bench", benchPlayer],
    ])
    const gamesMap = new Map<string, number>([
      ["active", 2],
      ["bench", 2],
    ])
    const totals = activeTeamWeeklyTotals(entries, playersById, gamesMap)
    expect(totals.PTS).toBeCloseTo((820 / ASSUMED_SEASON_GAMES) * 2)
  })

  it("active totals use last-15 when requested", () => {
    const player: SeasonPlayer = {
      id: "active",
      name: "Active",
      teamAbbr: "BOS",
      projections: {
        FG_PCT: 0.5,
        FT_PCT: 0.8,
        TPM: 0,
        REB: 0,
        AST: 0,
        STL: 0,
        BLK: 0,
        TO: 0,
        PTS: 820,
      },
      shooting: { FGM: 410, FGA: 820, FTM: 82, FTA: 102.5 },
      recentRates: {
        l15: {
          projections: {
            FG_PCT: 0.5,
            FT_PCT: 0.8,
            TPM: 0,
            REB: 0,
            AST: 0,
            STL: 0,
            BLK: 0,
            TO: 0,
            PTS: 40,
          },
          shooting: { FGM: 15, FGA: 30, FTM: 5, FTA: 5 },
        },
      },
    }
    const totals = activeTeamWeeklyTotals(
      [{ slot: "UTIL", playerId: "active" }],
      new Map([["active", player]]),
      new Map([["active", 2]]),
      "l15",
    )
    expect(totals.PTS).toBeCloseTo(80)
  })
})
