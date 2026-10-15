import { describe, expect, it } from "vitest"
import {
  buildEspnFantasyMatchupWindow,
  gamesFromProTeams,
  opponentEspnTeamIdFromSchedule,
  scoringPeriodDatesFromProTeams,
  scoringPeriodIdsForDays,
} from "@/lib/espn/fantasyMatchupSchedule"

const proTeams = [
  {
    id: 11,
    abbrev: "IND",
    proGamesByScoringPeriod: {
      "1": [
        {
          date: Date.parse("2026-10-20T23:30:00Z"),
          scoringPeriodId: 1,
          homeProTeamId: 3,
          awayProTeamId: 11,
        },
      ],
      "3": [
        {
          date: Date.parse("2026-10-22T23:30:00Z"),
          scoringPeriodId: 3,
          homeProTeamId: 11,
          awayProTeamId: 2,
        },
      ],
    },
  },
  {
    id: 3,
    abbrev: "NOP",
    proGamesByScoringPeriod: {},
  },
  {
    id: 2,
    abbrev: "BOS",
    proGamesByScoringPeriod: {},
  },
]

describe("espn fantasy matchup schedule", () => {
  it("fills off-day scoring periods between known NBA games", () => {
    const dates = scoringPeriodDatesFromProTeams(proTeams)
    expect(dates.get(1)).toBe("2026-10-20")
    expect(dates.get(2)).toBe("2026-10-21")
    expect(dates.get(3)).toBe("2026-10-22")
  })

  it("keeps ESPN weekly periods that already span 7 days", () => {
    const weekIds = [1, 2, 3, 4, 5, 6, 7]
    const weekProTeams = [
      {
        id: 11,
        abbrev: "IND",
        proGamesByScoringPeriod: {
          "1": [
            {
              date: Date.parse("2026-10-19T23:30:00Z"),
              scoringPeriodId: 1,
              homeProTeamId: 3,
              awayProTeamId: 11,
            },
          ],
          "7": [
            {
              date: Date.parse("2026-10-25T23:30:00Z"),
              scoringPeriodId: 7,
              homeProTeamId: 11,
              awayProTeamId: 2,
            },
          ],
        },
      },
      { id: 3, abbrev: "NOP", proGamesByScoringPeriod: {} },
      { id: 2, abbrev: "BOS", proGamesByScoringPeriod: {} },
    ]

    const window = buildEspnFantasyMatchupWindow({
      youEspnTeamId: 11,
      seasonPayload: { settings: { proTeams: weekProTeams } },
      leaguePayload: {
        status: { currentMatchupPeriod: 1 },
        settings: {
          scheduleSettings: {
            matchupPeriodLength: 7,
            matchupPeriods: { "1": weekIds },
          },
        },
        schedule: [
          {
            matchupPeriodId: 1,
            home: { teamId: 12 },
            away: { teamId: 11 },
          },
        ],
      },
    })

    expect(window.expandedToWeekly).toBe(false)
    expect(window.days).toHaveLength(7)
    expect(window.days[0]).toBe("2026-10-19")
    expect(window.days[6]).toBe("2026-10-25")
    expect(window.opponentEspnTeamId).toBe(12)
  })

  it("expands ESPN daily periods to Mon–Sun while keeping the opponent", () => {
    const window = buildEspnFantasyMatchupWindow({
      youEspnTeamId: 11,
      seasonPayload: { settings: { proTeams } },
      leaguePayload: {
        status: { currentMatchupPeriod: 1 },
        settings: {
          scheduleSettings: {
            matchupPeriodLength: 1,
            matchupPeriods: { "1": [1] },
          },
        },
        schedule: [
          {
            matchupPeriodId: 1,
            home: { teamId: 12 },
            away: { teamId: 11 },
          },
        ],
      },
    })

    expect(window.expandedToWeekly).toBe(true)
    expect(window.matchupPeriodId).toBe(1)
    expect(window.days).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ])
    expect(window.scoringPeriodIds).toEqual(
      scoringPeriodIdsForDays(window.days, scoringPeriodDatesFromProTeams(proTeams)),
    )
    expect(window.opponentEspnTeamId).toBe(12)
    expect(window.schedule.matchup.startDate).toBe("2026-10-19")
    expect(window.schedule.matchup.endDate).toBe("2026-10-25")
    expect(window.schedule.games).toEqual([
      {
        date: "2026-10-20",
        homeAbbr: "NOP",
        awayAbbr: "IND",
      },
      {
        date: "2026-10-22",
        homeAbbr: "IND",
        awayAbbr: "BOS",
      },
    ])
  })

  it("resolves opponent from either home or away side", () => {
    expect(
      opponentEspnTeamIdFromSchedule(
        [{ matchupPeriodId: 2, home: { teamId: 9 }, away: { teamId: 4 } }],
        2,
        9,
      ),
    ).toBe(4)
  })

  it("dedupes pro schedule games across teams", () => {
    const dates = scoringPeriodDatesFromProTeams(proTeams)
    const games = gamesFromProTeams(proTeams, new Set(["2026-10-20"]), dates)
    expect(games).toHaveLength(1)
  })
})
