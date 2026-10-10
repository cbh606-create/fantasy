import { describe, expect, it } from "vitest"
import { mapEspnDayBoxScore, pairClosedScoringPeriods } from "@/lib/espn/dayBoxScore"

describe("pairClosedScoringPeriods", () => {
  const matchupDates = ["2026-10-20", "2026-10-21", "2026-10-22"];

  it("pairs dates with matchup period days and omits the current day", () => {
    const paired = pairClosedScoringPeriods({
      dates: matchupDates,
      matchupDates,
      matchupPeriodDays: [10, 11, 12],
      currentScoringPeriod: 12,
    });

    expect([...paired]).toEqual([
      ["2026-10-20", 10],
      ["2026-10-21", 11],
    ]);
  });

  it("omits a date that is not in the matchup calendar", () => {
    const paired = pairClosedScoringPeriods({
      dates: ["2026-10-19", "2026-10-20"],
      matchupDates,
      matchupPeriodDays: [10, 11, 12],
      currentScoringPeriod: 12,
    });

    expect([...paired]).toEqual([["2026-10-20", 10]]);
  });

  it("throws when matchup dates and ESPN day ids differ in length", () => {
    expect(() =>
      pairClosedScoringPeriods({
        dates: matchupDates,
        matchupDates,
        matchupPeriodDays: [10, 11],
        currentScoringPeriod: 12,
      }),
    ).toThrow("espn_matchup_period_length_mismatch");
  });
});

describe("mapEspnDayBoxScore", () => {
  it("sums the two teams and records who played", () => {
    const line = mapEspnDayBoxScore({
      date: "2026-10-20",
      youTeamId: 9,
      oppTeamId: 4,
      payload: {
        schedule: [
          {
            home: {
              teamId: 9,
              rosterForCurrentScoringPeriod: {
                entries: [
                  {
                    playerPoolEntry: {
                      player: {
                        id: 101,
                        stats: [{ stats: { "0": 22, "6": 8, "13": 8, "14": 16, "15": 4, "16": 5, "17": 2 } }],
                      },
                    },
                  },
                  {
                    playerPoolEntry: {
                      player: {
                        id: 102,
                        stats: [{ stats: { "0": 0, "6": 0, "13": 0, "14": 0, "15": 0, "16": 0, "17": 0 } }],
                      },
                    },
                  },
                ],
              },
            },
            away: {
              teamId: 4,
              rosterForCurrentScoringPeriod: {
                entries: [
                  {
                    playerPoolEntry: {
                      player: {
                        id: 201,
                        stats: [{ stats: { "0": 15, "6": 4, "13": 5, "14": 12, "15": 3, "16": 4, "17": 1 } }],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    })

    expect(line?.date).toBe("2026-10-20")
    expect(line?.you.PTS).toBe(22)
    expect(line?.opp.PTS).toBe(15)
    expect(line?.you.FG_PCT).toBeCloseTo(8 / 16)
    expect(line?.youPlayedIds).toEqual(["101"])
    expect(line?.oppPlayedIds).toEqual(["201"])
    expect(line?.youShooting).toEqual({ FGM: 8, FGA: 16, FTM: 4, FTA: 5 })
  })

  it("returns null when neither team id is present", () => {
    expect(
      mapEspnDayBoxScore({
        date: "2026-10-20",
        youTeamId: 9,
        oppTeamId: 4,
        payload: { schedule: [] },
      }),
    ).toBeNull()
  })
})
