import { describe, expect, it } from "vitest"
import {
  dailyLineupsMatchDays,
  effectiveGamesByPlayerId,
  initDailyLineups,
  setSlotPlayer,
  togglePlayerDay,
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
  positions: ["PG"],
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
  positions: ["SG"],
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

  it("uses custom league active slots for templates and validation", () => {
    const rosterSlots = ["PG", "PG", "UTIL", "BE"] as const
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      [...rosterSlots],
    )

    expect(daily["2025-11-03"].map((entry) => entry.slot)).toEqual([
      "PG",
      "PG",
      "UTIL",
    ])
    expect(
      dailyLineupsMatchDays(daily, schedule.matchup.days, [...rosterSlots]),
    ).toBe(true)
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

  it("weights a start on the second night of a back-to-back as 0.75 games", () => {
    const backToBackSchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2025-11-03",
        endDate: "2025-11-04",
        days: ["2025-11-03", "2025-11-04"],
      },
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "BOS" },
      ],
    }
    let daily = initDailyLineups(backToBackSchedule.matchup.days, activeEntries)
    daily = setSlotPlayer(daily, "2025-11-03", 0, null)

    const games = effectiveGamesByPlayerId(daily, [star], backToBackSchedule)

    expect(games.get("star")).toBeCloseTo(0.75)
  })

  it("weights a Monday start after a Sunday game as 0.75 games", () => {
    const mondaySchedule: ScheduleResponse = {
      source: "live",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2026-03-09",
        endDate: "2026-03-15",
        days: ["2026-03-09"],
      },
      games: [
        { date: "2026-03-08", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2026-03-09", homeAbbr: "MIA", awayAbbr: "BOS" },
      ],
    }
    const daily = initDailyLineups(mondaySchedule.matchup.days, activeEntries)

    const games = effectiveGamesByPlayerId(daily, [star], mondaySchedule)

    expect(games.get("star")).toBeCloseTo(0.75)
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

describe("togglePlayerDay", () => {
  it("sits a starter and starts into the first empty slot", () => {
    const daily = initDailyLineups(schedule.matchup.days, activeEntries)
    const playersById = { star, scrub }

    const sat = togglePlayerDay(daily, "2025-11-03", "star", true, playersById)
    expect(sat.status).toBe("sat")
    expect(sat.daily["2025-11-03"][0].playerId).toBeNull()

    const started = togglePlayerDay(
      sat.daily,
      "2025-11-03",
      "star",
      true,
      playersById,
    )
    expect(started.status).toBe("started")
    expect(started.daily["2025-11-03"][0].playerId).toBe("star")
  })

  it("returns no_game and full without mutating when blocked", () => {
    const daily = initDailyLineups(schedule.matchup.days, activeEntries)
    const playersById = { star, scrub }
    const noGame = togglePlayerDay(
      daily,
      "2025-11-04",
      "star",
      false,
      playersById,
    )
    expect(noGame.status).toBe("no_game")
    expect(noGame.daily).toBe(daily)

    const fullEntries = daily["2025-11-03"].map((entry, index) => ({
      ...entry,
      playerId: entry.playerId ?? `fill-${index}`,
    }))
    const fullDaily = { ...daily, "2025-11-03": fullEntries }
    const blocked = togglePlayerDay(
      fullDaily,
      "2025-11-03",
      "extra",
      true,
      playersById,
    )
    expect(blocked.status).toBe("full")
    expect(blocked.daily).toBe(fullDaily)
  })

  it("returns ineligible when no empty slot accepts the player", () => {
    const center = { ...star, id: "center", positions: ["C"] as const }
    const daily = {
      "2025-11-03": [{ slot: "PG" as const, playerId: null }],
    }

    const result = togglePlayerDay(
      daily,
      "2025-11-03",
      center.id,
      true,
      { center },
    )

    expect(result.status).toBe("ineligible")
    expect(result.daily).toBe(daily)
  })
})
