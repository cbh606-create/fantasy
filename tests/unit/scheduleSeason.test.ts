import { describe, expect, it } from "vitest"
import {
  mondayOfWeekContaining,
  nextWeekWithGames,
} from "@/lib/matchup/scheduleSeason"
import type { ScheduleGame } from "@/lib/season/types"

const games: ScheduleGame[] = [
  { date: "2026-10-20", homeAbbr: "DET", awayAbbr: "BOS" },
  { date: "2026-10-20", homeAbbr: "NYK", awayAbbr: "PHI" },
  { date: "2026-10-21", homeAbbr: "LAL", awayAbbr: "GSW" },
  { date: "2026-10-26", homeAbbr: "BOS", awayAbbr: "NYK" },
]

describe("scheduleSeason", () => {
  it("mondayOfWeekContaining returns NY-calendar Monday for a Tuesday tip-off", () => {
    expect(mondayOfWeekContaining("2026-10-20")).toBe("2026-10-19")
  })

  it("nextWeekWithGames from offseason picks opening week", () => {
    const schedule = nextWeekWithGames(games, "2026-08-24")
    expect(schedule).not.toBeNull()
    expect(schedule!.source).toBe("season")
    expect(schedule!.matchup.startDate).toBe("2026-10-19")
    expect(schedule!.matchup.endDate).toBe("2026-10-25")
    expect(schedule!.games.every((g) => schedule!.matchup.days.includes(g.date))).toBe(true)
    expect(schedule!.games.length).toBe(3)
  })

  it("nextWeekWithGames returns null when no future games", () => {
    expect(nextWeekWithGames(games, "2027-05-01")).toBeNull()
  })
})
