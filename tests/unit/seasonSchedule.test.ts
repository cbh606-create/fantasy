import { describe, expect, it } from "vitest"
import { buildPlayerMatchupSchedule } from "@/lib/season/schedule"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-03-09",
    endDate: "2026-03-11",
    days: ["2026-03-09", "2026-03-10", "2026-03-11"],
  },
  games: [
    { date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "LAL" },
    { date: "2026-03-10", homeAbbr: "NYK", awayAbbr: "BOS" },
    { date: "2026-03-10", homeAbbr: "MIA", awayAbbr: "BOS" },
    { date: "2026-03-11", homeAbbr: "GSW", awayAbbr: "DEN" },
  ],
}

const players: SeasonPlayer[] = [
  {
    id: "p1",
    name: "Home Star",
    teamAbbr: "BOS",
    projections: {} as SeasonPlayer["projections"],
    shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  },
  {
    id: "p2",
    name: "No Team",
    projections: {} as SeasonPlayer["projections"],
    shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  },
]

const entries: SeasonRosterEntry[] = [
  { slot: "PG", playerId: "p1" },
  { slot: "SG", playerId: null },
  { slot: "SF", playerId: "p2" },
]

describe("buildPlayerMatchupSchedule", () => {
  it("labels home/away, counts doubleheader as one game-day, handles empty and unknown team", () => {
    const rows = buildPlayerMatchupSchedule({ entries, players, schedule })

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      slot: "PG",
      name: "Home Star",
      teamAbbr: "BOS",
      games: 2,
      teamUnknown: false,
    })
    expect(rows[0].cells["2026-03-09"]).toEqual(["vs LAL"])
    expect(rows[0].cells["2026-03-10"]).toEqual(["@NYK", "@MIA"])
    expect(rows[0].cells["2026-03-11"]).toEqual([])

    expect(rows[1]).toMatchObject({
      slot: "SG",
      playerId: null,
      name: "Empty",
      games: null,
      teamUnknown: false,
    })
    expect(rows[1].cells["2026-03-09"]).toEqual([])

    expect(rows[2]).toMatchObject({
      slot: "SF",
      name: "No Team",
      teamAbbr: null,
      games: 0,
      teamUnknown: true,
    })
  })
})
