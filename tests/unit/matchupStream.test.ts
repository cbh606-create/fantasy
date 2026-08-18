import { describe, expect, it } from "vitest"
import { gamesInDaysByPlayerId } from "@/lib/matchup/games"
import { resolveWindowDays } from "@/lib/waivers/matchupStream"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-15",
    days: [
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "LAL", awayAbbr: "BOS" },
    { date: "2026-03-11", homeAbbr: "LAL", awayAbbr: "NYK" },
    { date: "2026-03-14", homeAbbr: "MIA", awayAbbr: "LAL" },
  ],
}

describe("resolveWindowDays", () => {
  it("returns full matchup days when dayCount omitted", () => {
    expect(resolveWindowDays(schedule)).toEqual(schedule.matchup.days)
  })

  it("returns prefix when dayCount is 3", () => {
    expect(resolveWindowDays(schedule, 3)).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ])
  })

  it("clamps dayCount to available days", () => {
    expect(resolveWindowDays(schedule, 99)).toEqual(schedule.matchup.days)
  })
})

describe("gamesInDaysByPlayerId", () => {
  it("counts distinct game dates in the window only", () => {
    const players = [
      { id: "a", teamAbbr: "LAL" },
      { id: "b", teamAbbr: "MIA" },
    ] as SeasonPlayer[]

    const full = gamesInDaysByPlayerId(players, schedule, schedule.matchup.days)
    expect(full.get("a")).toBe(3)
    expect(full.get("b")).toBe(1)

    const twoDays = gamesInDaysByPlayerId(players, schedule, [
      "2026-03-09",
      "2026-03-10",
    ])
    expect(twoDays.get("a")).toBe(1)
    expect(twoDays.get("b")).toBe(0)
  })
})
