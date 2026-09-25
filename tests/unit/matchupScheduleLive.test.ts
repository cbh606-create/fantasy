import { afterEach, describe, expect, it, vi } from "vitest"
import espnScoreboard from "../../data/fixtures/espn-nba-scoreboard-sample.json"
import scheduleFixture from "../../data/fixtures/nba-matchup-schedule.json"
import {
  buildWeekDays,
  clearMatchupScheduleCache,
  getMatchupSchedule,
  normalizeEspnTeamAbbr,
  normalizeEspnScoreboard,
} from "@/lib/matchup/scheduleLive"
import type { ScheduleResponse } from "@/lib/season/types"

const espnScoreboardFor = (isoDate: string, homeAbbr = "BOS", awayAbbr = "LAL") => ({
  events: [
    {
      date: `${isoDate}T23:30Z`,
      competitions: [
        {
          date: `${isoDate}T23:30Z`,
          competitors: [
            { homeAway: "home", team: { abbreviation: homeAbbr } },
            { homeAway: "away", team: { abbreviation: awayAbbr } },
          ],
        },
      ],
    },
  ],
})

describe("live matchup schedule", () => {
  afterEach(() => {
    vi.useRealTimers()
    clearMatchupScheduleCache()
  })

  it("builds every ISO date in an inclusive week", () => {
    expect(buildWeekDays("2026-03-09", "2026-03-15")).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ])
  })

  it("normalizes an ESPN scoreboard into a live schedule", () => {
    const schedule = normalizeEspnScoreboard(espnScoreboard, {
      scoringPeriodId: 1,
      startIso: "2026-03-09",
      endIso: "2026-03-15",
    })

    expect(schedule.source).toBe("live")
    expect(schedule.matchup.days).toHaveLength(7)
    expect(schedule.games).toEqual([
      {
        date: "2026-03-09",
        homeAbbr: "BOS",
        awayAbbr: "LAL",
      },
    ])
  })

  it("normalizes ESPN team abbreviations to player-map abbreviations", () => {
    expect(["GS", "NY", "NO", "SA", "WSH", "UTAH"].map(normalizeEspnTeamAbbr)).toEqual([
      "GSW",
      "NYK",
      "NOP",
      "SAS",
      "WAS",
      "UTA",
    ])
  })

  it("applies abbreviation mapping when building live games", () => {
    const schedule = normalizeEspnScoreboard(
      {
        events: [
          {
            date: "2026-03-09T23:30Z",
            competitions: [
              {
                date: "2026-03-09T23:30Z",
                competitors: [
                  { homeAway: "home", team: { abbreviation: "GS" } },
                  { homeAway: "away", team: { abbreviation: "NY" } },
                ],
              },
            ],
          },
        ],
      },
      {
        scoringPeriodId: 1,
        startIso: "2026-03-09",
        endIso: "2026-03-15",
      },
    )

    expect(schedule.games).toEqual([
      {
        date: "2026-03-09",
        homeAbbr: "GSW",
        awayAbbr: "NYK",
      },
    ])
  })

  it("uses published season next week when live returns no games", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T16:00:00Z"))
    const schedule = await getMatchupSchedule({
      fetchImpl: async () =>
        new Response(JSON.stringify({ events: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    })
    expect(schedule.source).toBe("season")
    expect(schedule.matchup.startDate).toBe("2026-10-19")
    expect(schedule.games.length).toBeGreaterThan(0)
  })

  it("uses published season when the live request fails during offseason", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T16:00:00Z"))
    const schedule = await getMatchupSchedule({
      fetchImpl: async () => {
        throw new Error("network unavailable")
      },
    })
    expect(schedule.source).toBe("season")
    expect(schedule.matchup.startDate).toBe("2026-10-19")
  })

  it("treats lookback-only live games as empty and uses season", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T16:00:00Z"))
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes("dates=20260823")
        ? espnScoreboardFor("2026-08-23")
        : { events: [] }
      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    const schedule = await getMatchupSchedule({ fetchImpl })
    expect(schedule.source).toBe("season")
    expect(schedule.matchup.startDate).toBe("2026-10-19")
  })

  it("falls back to the fixture when live fails and season has no future games", async () => {
    const schedule = await getMatchupSchedule({
      now: new Date("2027-06-01T16:00:00Z"),
      fetchImpl: async () => {
        throw new Error("network unavailable")
      },
    })

    expect(schedule).toEqual(scheduleFixture as ScheduleResponse)
    expect(schedule.source).toBe("fixture")
  })

  it("keeps live when ESPN returns games for the current week", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"))
    const fetchImpl = async () =>
      new Response(JSON.stringify(espnScoreboardFor("2026-08-26")), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })

    const schedule = await getMatchupSchedule({ fetchImpl })
    expect(schedule.source).toBe("live")
    expect(schedule.games).toEqual([
      {
        date: "2026-08-26",
        homeAbbr: "BOS",
        awayAbbr: "LAL",
      },
    ])
  })

  it("fetches the New York Monday-Sunday window and caches it", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"))
    const requestedUrls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return new Response(JSON.stringify(espnScoreboardFor("2026-08-26")), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    const first = await getMatchupSchedule({ fetchImpl })
    const second = await getMatchupSchedule({ fetchImpl })

    expect(first.source).toBe("live")
    expect(first.matchup.days).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ])
    expect(requestedUrls).toHaveLength(8)
    expect(requestedUrls[0]).toContain("dates=20260823")
    expect(requestedUrls[1]).toContain("dates=20260824")
    expect(requestedUrls[7]).toContain("dates=20260830")
    expect(second).toBe(first)
  })

  it("serves same-week stale cache when a live refresh fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"))
    const okFetch = async () =>
      new Response(JSON.stringify(espnScoreboardFor("2026-08-26")), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })

    const seeded = await getMatchupSchedule({ fetchImpl: okFetch })
    expect(seeded.source).toBe("live")

    // Expire the 20-minute TTL, then fail the refresh.
    vi.setSystemTime(new Date("2026-08-26T12:21:00Z"))
    const stale = await getMatchupSchedule({
      fetchImpl: async () => {
        throw new Error("network unavailable")
      },
    })
    expect(stale).toBe(seeded)
    expect(stale.source).toBe("live")
  })
})
