import { describe, expect, it } from "vitest"
import {
  gameWeightForTeamDate,
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
