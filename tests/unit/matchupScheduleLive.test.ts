import { afterEach, describe, expect, it, vi } from "vitest"
import espnScoreboard from "../../data/fixtures/espn-nba-scoreboard-sample.json"
import scheduleFixture from "../../data/fixtures/nba-matchup-schedule.json"
import {
  buildWeekDays,
  getMatchupSchedule,
  normalizeEspnScoreboard,
} from "@/lib/matchup/scheduleLive"
import type { ScheduleResponse } from "@/lib/season/types"

describe("live matchup schedule", () => {
  afterEach(() => {
    vi.useRealTimers()
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

  it("falls back to the fixture when the live request fails", async () => {
    const schedule = await getMatchupSchedule({
      fetchImpl: async () => {
        throw new Error("network unavailable")
      },
    })

    expect(schedule).toEqual(scheduleFixture as ScheduleResponse)
    expect(schedule.source).toBe("fixture")
  })

  it("fetches the New York Monday-Sunday window and caches it", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"))
    const requestedUrls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return new Response(JSON.stringify({ events: [] }), {
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
    expect(requestedUrls).toHaveLength(7)
    expect(requestedUrls[0]).toContain("dates=20260824")
    expect(requestedUrls[6]).toContain("dates=20260830")
    expect(second).toBe(first)
  })
})
