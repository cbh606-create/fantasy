import { describe, expect, it } from "vitest"
import {
  B2B_NIGHT2_MIN_OPPORTUNITIES,
  B2B_SECOND_NIGHT_PLAY_RATE,
} from "@/lib/matchup/constants"
import {
  gameWeightForTeamDate,
  night2PlayRateFromLogs,
  setB2bNight2RateTableForTests,
  weightedGamesInDaysByPlayerId,
  weightedGamesThisWeekByPlayerId,
} from "@/lib/matchup/games"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-11",
    days: ["2026-03-09", "2026-03-10", "2026-03-11"],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2026-03-10", homeAbbr: "BOS", awayAbbr: "MIA" },
    { date: "2026-03-11", homeAbbr: "LAL", awayAbbr: "BOS" },
  ],
}

describe("B2B game weights", () => {
  it("marks second night 0.75 and isolated night 1", () => {
    expect(gameWeightForTeamDate("BOS", "2026-03-09", schedule)).toBe(1)
    expect(gameWeightForTeamDate("BOS", "2026-03-10", schedule)).toBe(0.75)
    expect(gameWeightForTeamDate("BOS", "2026-03-11", schedule)).toBe(0.75)
  })

  it("sums weighted games for a player", () => {
    const players: SeasonPlayer[] = [
      {
        id: "1",
        name: "Tatum",
        teamAbbr: "BOS",
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
    ]
    const map = weightedGamesInDaysByPlayerId(
      players,
      schedule,
      schedule.matchup.days,
    )
    expect(map.get("1")).toBeCloseTo(1 + 0.75 + 0.75, 5)
  })

  it("weights Monday as a second night when Sunday is included as lookback", () => {
    const mondaySchedule: ScheduleResponse = {
      ...schedule,
      matchup: {
        ...schedule.matchup,
        days: ["2026-03-09"],
      },
      games: [
        { date: "2026-03-08", homeAbbr: "NYK", awayAbbr: "BOS" },
        { date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "MIA" },
      ],
    }
    const player: SeasonPlayer = {
      id: "1",
      name: "Tatum",
      teamAbbr: "BOS",
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
    }

    expect(
      weightedGamesThisWeekByPlayerId([player], mondaySchedule).get("1"),
    ).toBe(0.75)
  })
})

describe("per-player 2025-26 B2B night-2 rates", () => {
  it("exports the sparse-sample threshold used by the fallback", () => {
    expect(B2B_NIGHT2_MIN_OPPORTUNITIES).toBe(4)
    expect(B2B_SECOND_NIGHT_PLAY_RATE).toBe(0.75)
  })

  it("uses appearances / opportunities when the sample is large enough", () => {
    expect(night2PlayRateFromLogs(3, 5)).toBe(0.6)
    expect(night2PlayRateFromLogs(9, 10)).toBe(0.9)
  })

  it("falls back to 0.75 when opportunities are below the threshold or logs are missing", () => {
    expect(night2PlayRateFromLogs(1, B2B_NIGHT2_MIN_OPPORTUNITIES - 1)).toBe(
      B2B_SECOND_NIGHT_PLAY_RATE,
    )
    expect(night2PlayRateFromLogs(0, 0)).toBe(B2B_SECOND_NIGHT_PLAY_RATE)
  })

  it("does not zero a low but valid night-2 rate", () => {
    expect(night2PlayRateFromLogs(1, 5)).toBe(0.2)
  })

  it("night 1 is 1, no game is 0, and night 2 uses that player's rate", () => {
    setB2bNight2RateTableForTests({
      "p-high": { appearances: 3, opportunities: 5 },
    })
    expect(gameWeightForTeamDate("BOS", "2026-03-09", schedule, undefined, "p-high")).toBe(1)
    expect(gameWeightForTeamDate("BOS", "2026-03-10", schedule, undefined, "p-high")).toBe(0.6)
    expect(gameWeightForTeamDate("BOS", "2026-03-12", schedule, undefined, "p-high")).toBe(0)
    expect(gameWeightForTeamDate("BOS", "2026-03-10", schedule, undefined, "p-missing")).toBe(
      B2B_SECOND_NIGHT_PLAY_RATE,
    )
    expect([0, 1, B2B_SECOND_NIGHT_PLAY_RATE]).not.toContain(
      gameWeightForTeamDate("BOS", "2026-03-10", schedule, undefined, "p-high"),
    )
  })

  it("loads 2025-26 logs with at least one rate that is not 0, 1, or 0.75", async () => {
    const { default: night2File } = await import(
      "../../../data/players/b2b_night2_2025_26.json"
    )
    const rows = Object.values(
      (night2File as { players?: Record<string, { appearances: number; opportunities: number }> })
        .players ?? {},
    )
    const rates = rows
      .filter((row) => row.opportunities >= B2B_NIGHT2_MIN_OPPORTUNITIES)
      .map((row) => row.appearances / row.opportunities)
    expect(rates.length).toBeGreaterThan(0)
    expect(rates.some((rate) => rate !== 0 && rate !== 1 && rate !== 0.75)).toBe(
      true,
    )
  })
})
