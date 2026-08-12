import { describe, expect, it } from "vitest"
import {
  effectiveGamesByPlayerId,
  initDailyLineups,
  setSlotPlayer,
  youTotalsFromDaily,
} from "@/lib/matchup/dailyLineups"
import { ASSUMED_SEASON_GAMES } from "@/lib/matchup/constants"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-05",
    days: ["2025-11-03", "2025-11-04", "2025-11-05"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
  ],
}

const star: SeasonPlayer = {
  id: "star",
  name: "Star",
  teamAbbr: "BOS",
  projections: {
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 82,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 1640,
  },
  shooting: { FGM: 820, FGA: 1640, FTM: 164, FTA: 205 },
}

const scrub: SeasonPlayer = {
  id: "scrub",
  name: "Scrub",
  teamAbbr: "NYK",
  projections: {
    FG_PCT: 0.4,
    FT_PCT: 0.7,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 820,
  },
  shooting: { FGM: 100, FGA: 250, FTM: 50, FTA: 70 },
}

const activeEntries: SeasonRosterEntry[] = [
  { slot: "PG", playerId: "star" },
  { slot: "SG", playerId: "scrub" },
  { slot: "SF", playerId: null },
  { slot: "PF", playerId: null },
  { slot: "C", playerId: null },
  { slot: "G", playerId: null },
  { slot: "F", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "BE", playerId: "star" },
]

describe("initDailyLineups", () => {
  it("clones active slots for each day and ignores BE", () => {
    const daily = initDailyLineups(schedule.matchup.days, activeEntries)

    expect(Object.keys(daily)).toEqual(schedule.matchup.days)
    expect(daily["2025-11-03"]).toHaveLength(10)
    expect(daily["2025-11-03"][0]).toEqual({ slot: "PG", playerId: "star" })
    expect(daily["2025-11-03"].some((entry) => entry.slot === "BE")).toBe(false)
  })
})

describe("effectiveGamesByPlayerId", () => {
  it("counts only days the player starts and has a game", () => {
    let daily = initDailyLineups(schedule.matchup.days, activeEntries)
    // Sit star on first BOS game day
    daily = setSlotPlayer(daily, "2025-11-03", 0, null)

    const games = effectiveGamesByPlayerId(daily, [star, scrub], schedule)

    expect(games.get("star")).toBe(1)
    expect(games.get("scrub")).toBe(1)
  })
})

describe("youTotalsFromDaily", () => {
  it("drops PTS when a multi-game starter is sat on a game day", () => {
    const full = initDailyLineups(schedule.matchup.days, activeEntries)
    const sat = setSlotPlayer(full, "2025-11-03", 0, null)

    const fullTotals = youTotalsFromDaily(full, [star, scrub], schedule)
    const satTotals = youTotalsFromDaily(sat, [star, scrub], schedule)

    const expectedDrop = (1640 / ASSUMED_SEASON_GAMES) * 1
    expect(fullTotals.PTS - satTotals.PTS).toBeCloseTo(expectedDrop)
  })
})

describe("setSlotPlayer", () => {
  it("clears a duplicate player from another slot the same day", () => {
    const daily = initDailyLineups(schedule.matchup.days, activeEntries)
    const next = setSlotPlayer(daily, "2025-11-03", 2, "star")

    expect(next["2025-11-03"][0].playerId).toBeNull()
    expect(next["2025-11-03"][2].playerId).toBe("star")
  })
})
