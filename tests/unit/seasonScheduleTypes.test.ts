import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/nba-matchup-schedule.json"
import type { ScheduleResponse } from "@/lib/season/types"

describe("nba matchup schedule fixture", () => {
  it("covers a 7-day scoring period with games", () => {
    const schedule = fixture as ScheduleResponse
    expect(schedule.source).toBe("fixture")
    expect(schedule.matchup.days).toHaveLength(7)
    expect(schedule.matchup.startDate).toBe(schedule.matchup.days[0])
    expect(schedule.matchup.endDate).toBe(schedule.matchup.days[6])
    expect(schedule.games.length).toBeGreaterThan(10)
    expect(schedule.games.every((game) => schedule.matchup.days.includes(game.date))).toBe(true)
  })
})
