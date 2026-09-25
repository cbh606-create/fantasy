import { describe, expect, it } from "vitest"
import {
  autofillOpenSlotsFromRoster,
  buildDayLineupFromRoster,
  buildLineupDisplayRows,
  dailyLineupsMatchDays,
  effectiveGamesByPlayerId,
  initDailyLineups,
  isDailyLineupFullForDate,
  setSlotPlayer,
  sortPlayerIdsByLineupSlots,
  togglePlayerDay,
  youTotalsFromDaily,
  type DailyLineups,
} from "@/lib/matchup/dailyLineups"
import { ASSUMED_SEASON_GAMES } from "@/lib/matchup/constants"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonPosition,
  SeasonRosterEntry,
} from "@/lib/season/types"

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
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      undefined,
      [star, scrub],
      schedule,
    )

    expect(Object.keys(daily)).toEqual(schedule.matchup.days)
    expect(daily["2025-11-03"]).toHaveLength(10)
    expect(daily["2025-11-03"][0]).toEqual({ slot: "PG", playerId: "star" })
    expect(daily["2025-11-03"].some((entry) => entry.slot === "BE")).toBe(false)
  })

  it("clears starters who have no NBA game that day", () => {
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      undefined,
      [star, scrub],
      schedule,
    )

    // scrub (NYK) only plays 2025-11-03; star (BOS) plays 03 and 05
    expect(daily["2025-11-03"].map((entry) => entry.playerId).filter(Boolean).sort()).toEqual([
      "scrub",
      "star",
    ])
    expect(daily["2025-11-04"].every((entry) => entry.playerId === null)).toBe(
      true,
    )
    expect(daily["2025-11-05"].map((entry) => entry.playerId).filter(Boolean)).toEqual([
      "star",
    ])
  })

  it("autostarts bench players with games into vacated active slots", () => {
    const benchGuard: SeasonPlayer = {
      ...scrub,
      id: "bench-g",
      name: "Bench Guard",
      teamAbbr: "BOS",
      positions: ["SG", "G"],
    }
    const entries: SeasonRosterEntry[] = [
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
      { slot: "BE", playerId: "bench-g" },
      { slot: "BE", playerId: null },
      { slot: "BE", playerId: null },
      { slot: "IL", playerId: null },
    ]

    const daily = initDailyLineups(
      schedule.matchup.days,
      entries,
      undefined,
      [star, scrub, benchGuard],
      schedule,
    )

    // 11-05: scrub (NYK) has no game; star + bench BOS fill active slots
    const day = daily["2025-11-05"]
    const started = day.map((entry) => entry.playerId).filter(Boolean)
    expect(started).toContain("star")
    expect(started).toContain("bench-g")
    expect(started).not.toContain("scrub")
    expect(started).toHaveLength(2)
  })

  it("fills up to 10 actives when enough rostered players have games", () => {
    const makers = Array.from({ length: 12 }, (_, index) => {
      const id = `p${index}`
      return {
        player: {
          ...star,
          id,
          name: `P${index}`,
          teamAbbr: "BOS",
          positions: ["PG", "SG", "SF", "PF", "C", "G", "F"] as const,
        },
        entrySlot:
          (
            [
              "PG",
              "SG",
              "SF",
              "PF",
              "C",
              "G",
              "F",
              "UTIL",
              "UTIL",
              "UTIL",
              "BE",
              "BE",
            ] as const
          )[index],
      }
    })
    const entries: SeasonRosterEntry[] = [
      ...makers.map(({ player, entrySlot }) => ({
        slot: entrySlot,
        playerId: player.id,
      })),
      { slot: "BE" as const, playerId: null },
      { slot: "IL" as const, playerId: null },
    ]
    const bosDay: ScheduleResponse = {
      ...schedule,
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "CHI" },
      ],
    }

    const daily = initDailyLineups(
      bosDay.matchup.days,
      entries,
      undefined,
      makers.map(({ player }) => player),
      bosDay,
    )

    expect(
      daily["2025-11-03"].filter((entry) => entry.playerId).length,
    ).toBe(10)
  })

  it("uses custom league active slots for templates and validation", () => {
    const rosterSlots = ["PG", "PG", "UTIL", "BE"] as const
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      [...rosterSlots],
      [star, scrub],
      schedule,
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
  it("keeps a playing starter started when sitting would leave an eligible hole", () => {
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      undefined,
      [star, scrub],
      schedule,
    )
    const playersById = { star, scrub }

    const sat = togglePlayerDay(
      daily,
      "2025-11-03",
      "star",
      true,
      playersById,
      undefined,
      schedule,
    )
    expect(sat.status).toBe("started")
    expect(sat.daily).toBe(daily)
    expect(sat.daily["2025-11-03"][0].playerId).toBe("star")
  })

  it("starts into the first empty slot", () => {
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      undefined,
      [star, scrub],
      schedule,
    )
    const playersById = { star, scrub }
    const opened = {
      ...daily,
      "2025-11-03": daily["2025-11-03"]!.map((entry, index) =>
        index === 0 ? { ...entry, playerId: null } : entry,
      ),
    }

    const started = togglePlayerDay(
      opened,
      "2025-11-03",
      "star",
      true,
      playersById,
      undefined,
      schedule,
    )
    expect(started.status).toBe("started")
    expect(started.daily["2025-11-03"][0].playerId).toBe("star")
  })

  it("starts into a slot held by a no-game player without requiring a manual sit", () => {
    const benchGuard: SeasonPlayer = {
      ...scrub,
      id: "bench-g",
      teamAbbr: "BOS",
      positions: ["SG"],
    }
    const fullNoGameDay: DailyLineups = {
      "2025-11-05": [
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
      ],
    }

    const started = togglePlayerDay(
      fullNoGameDay,
      "2025-11-05",
      benchGuard.id,
      true,
      { star, scrub, [benchGuard.id]: benchGuard },
      undefined,
      schedule,
    )

    expect(started.status).toBe("started")
    expect(started.daily["2025-11-05"][1].playerId).toBe("bench-g")
  })

  it("returns no_game and full without mutating when blocked", () => {
    const daily = initDailyLineups(
      schedule.matchup.days,
      activeEntries,
      undefined,
      [star, scrub],
      schedule,
    )
    const playersById = { star, scrub }
    const noGame = togglePlayerDay(
      daily,
      "2025-11-04",
      "star",
      false,
      playersById,
      undefined,
      schedule,
    )
    expect(noGame.status).toBe("no_game")
    expect(noGame.daily).toBe(daily)

    const playingFiller = (index: number): SeasonPlayer => ({
      ...star,
      id: `fill-${index}`,
      teamAbbr: "BOS",
      positions: ["UTIL"],
    })
    const fullEntries = daily["2025-11-03"].map((entry, index) => ({
      ...entry,
      playerId: entry.playerId ?? `fill-${index}`,
    }))
    const fullPlayers = Object.fromEntries(
      fullEntries.map((entry, index) => {
        const id = entry.playerId ?? `fill-${index}`
        if (id === "star") return [id, star]
        if (id === "scrub") return [id, scrub]
        return [id, playingFiller(index)]
      }),
    )
    const fullDaily = { ...daily, "2025-11-03": fullEntries }
    const blocked = togglePlayerDay(
      fullDaily,
      "2025-11-03",
      "extra",
      true,
      fullPlayers,
      undefined,
      schedule,
    )
    expect(blocked.status).toBe("full")
    expect(blocked.daily).toBe(fullDaily)
  })

  it("starts a playing player into any empty active slot when one exists", () => {
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
      undefined,
      schedule,
    )

    expect(result.status).toBe("started")
    expect(result.daily["2025-11-03"]?.[0]?.playerId).toBe("center")
  })
})

describe("isDailyLineupFullForDate", () => {
  it("is true when every active slot has a player with a game that day", () => {
    const day = "2025-11-03"
    const entries = Array.from({ length: 10 }, (_, index) => ({
      slot: (index < 5
        ? (["PG", "SG", "SF", "PF", "C"] as const)[index]!
        : "UTIL") as SeasonRosterEntry["slot"],
      playerId: `fill-${index}`,
    }))
    const playersById = Object.fromEntries(
      entries.map((entry) => [
        entry.playerId!,
        {
          ...star,
          id: entry.playerId!,
          teamAbbr: "BOS",
          positions: ["PG"] as SeasonPlayer["positions"],
        },
      ]),
    )
    expect(
      isDailyLineupFullForDate({ [day]: entries }, day, playersById, schedule),
    ).toBe(true)
  })

  it("is false when any slot is empty or occupied by a no-game player", () => {
    const day = "2025-11-03"
    const entries: SeasonRosterEntry[] = [
      { slot: "PG", playerId: "star" },
      { slot: "SG", playerId: null },
    ]
    expect(
      isDailyLineupFullForDate({ [day]: entries }, day, { star }, schedule),
    ).toBe(false)

    const noGameDay = "2025-11-04"
    expect(
      isDailyLineupFullForDate(
        {
          [noGameDay]: [{ slot: "PG", playerId: "star" }],
        },
        noGameDay,
        { star },
        schedule,
      ),
    ).toBe(false)
  })
})

describe("sortPlayerIdsByLineupSlots", () => {
  it("defaults to weekly roster index (PG before Bench)", () => {
    expect(
      sortPlayerIdsByLineupSlots(
        ["bench", "pg"],
        {},
        null,
        { pg: 0, bench: 10 },
      ),
    ).toEqual(["pg", "bench"])
  })

  it("sorts started players by that day's slot order first", () => {
    const daily: DailyLineups = {
      "2025-11-03": [
        { slot: "PG", playerId: "bench" },
        { slot: "UTIL", playerId: "util" },
      ],
    }

    expect(
      sortPlayerIdsByLineupSlots(
        ["pg", "util", "bench"],
        daily,
        "2025-11-03",
        { pg: 0, util: 7, bench: 10 },
      ),
    ).toEqual(["bench", "util", "pg"])
  })
})

describe("buildLineupDisplayRows", () => {
  const roster: SeasonRosterEntry[] = [
    { slot: "PG", playerId: "pg-1" },
    { slot: "C", playerId: "c-1" },
    { slot: "BE", playerId: "be-1" },
    { slot: "BE", playerId: "be-2" },
    { slot: "BE", playerId: "be-3" },
  ]

  it("keeps off-night and sit players on roster home slots", () => {
    const rows = buildLineupDisplayRows(roster)
    expect(rows.find((row) => row.slot === "PG")?.playerId).toBe("pg-1")
    expect(rows.find((row) => row.slot === "C")?.playerId).toBe("c-1")
    expect(rows.filter((row) => row.slot === "BE").map((row) => row.playerId)).toEqual([
      "be-1",
      "be-2",
      "be-3",
    ])
    expect(rows.filter((row) => row.slot === "PG")).toHaveLength(1)
    expect(rows.filter((row) => row.slot === "UTIL")).toHaveLength(0)
  })

  it("does not reorder when extra args look like a different focus day", () => {
    const first = buildLineupDisplayRows(roster)
    const second = buildLineupDisplayRows(roster, [], [])
    expect(first.map((row) => row.playerId)).toEqual(second.map((row) => row.playerId))
  })

  it("renders empty active seats as empty rows", () => {
    const rows = buildLineupDisplayRows([
      { slot: "PG", playerId: null },
      { slot: "C", playerId: "c-1" },
    ])
    expect(rows.find((row) => row.slot === "PG")?.playerId).toBeNull()
    expect(rows.find((row) => row.slot === "C")?.playerId).toBe("c-1")
    expect(rows.filter((row) => row.slot === "BE")).toHaveLength(0)
  })

  it("appends preview streamers as PV rows and does not put them in PG", () => {
    const rows = buildLineupDisplayRows(roster, ["fa-a"])
    expect(rows.find((row) => row.slot === "PG")?.playerId).toBe("pg-1")
    const preview = rows.filter((row) => row.slot === "PV")
    expect(preview.map((row) => row.playerId)).toEqual(["fa-a"])
    expect(rows.at(-1)?.slot).toBe("PV")
  })

  it("renders every league seat including extra G, UTIL, and BE", () => {
    const rows = buildLineupDisplayRows([
      { slot: "PG", playerId: "pg-1" },
      { slot: "G", playerId: "g-1" },
      { slot: "G", playerId: "g-2" },
      { slot: "UTIL", playerId: "u-1" },
      { slot: "UTIL", playerId: "u-2" },
      { slot: "UTIL", playerId: "u-3" },
      { slot: "UTIL", playerId: "u-4" },
      { slot: "BE", playerId: "be-1" },
      { slot: "BE", playerId: "be-2" },
      { slot: "BE", playerId: "be-3" },
      { slot: "BE", playerId: "be-4" },
    ])
    expect(rows.filter((row) => row.slot === "G").map((row) => row.playerId)).toEqual([
      "g-1",
      "g-2",
    ])
    expect(rows.filter((row) => row.slot === "UTIL").map((row) => row.playerId)).toEqual([
      "u-1",
      "u-2",
      "u-3",
      "u-4",
    ])
    expect(rows.filter((row) => row.slot === "BE").map((row) => row.playerId)).toEqual([
      "be-1",
      "be-2",
      "be-3",
      "be-4",
    ])
  })
})

describe("buildLineupDisplayRows focus-day seats", () => {
  const mon = "2025-11-03"
  const tue = "2025-11-04"

  const focusSchedule: ScheduleResponse = {
    source: "fixture",
    matchup: {
      scoringPeriodId: 1,
      startDate: mon,
      endDate: tue,
      days: [mon, tue],
    },
    games: [
      { date: mon, homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: mon, homeAbbr: "ATL", awayAbbr: "SAS" },
      { date: mon, homeAbbr: "ORL", awayAbbr: "CLE" },
      { date: tue, homeAbbr: "NYK", awayAbbr: "DET" },
    ],
  }

  const player = (
    id: string,
    teamAbbr: string,
    positions: SeasonPosition[],
  ): SeasonPlayer => ({
    id,
    name: id,
    teamAbbr,
    positions,
    projections: star.projections,
    shooting: star.shooting,
  })

  const players = [
    player("a", "BOS", ["PG"]),
    player("b", "NYK", ["SG"]),
    player("c", "MIA", ["SF"]),
    player("d", "ATL", ["C"]),
    player("e", "DET", ["PF"]),
    player("f", "SAS", ["SG"]),
    player("injured", "ORL", ["PF"]),
    player("streamer", "SAS", ["PF"]),
  ]
  const playersById = Object.fromEntries(
    players.map((entry) => [entry.id, entry]),
  )

  const roster: SeasonRosterEntry[] = [
    { slot: "PG", playerId: "a" },
    { slot: "SG", playerId: "b" },
    { slot: "SF", playerId: "c" },
    { slot: "PF", playerId: null },
    { slot: "C", playerId: "d" },
    { slot: "UTIL", playerId: "e" },
    { slot: "BE", playerId: "f" },
    { slot: "IL", playerId: "injured" },
  ]

  const mondayStarts: DailyLineups = {
    [mon]: [
      { slot: "PG", playerId: "a" },
      { slot: "SG", playerId: null },
      { slot: "SF", playerId: "c" },
      { slot: "PF", playerId: null },
      { slot: "C", playerId: "d" },
      { slot: "UTIL", playerId: "f" },
    ],
  }

  const focus = {
    focusDay: mon,
    schedule: focusSchedule,
    playersById,
    daily: mondayStarts,
  }

  const occupant = (
    rows: ReturnType<typeof buildLineupDisplayRows>,
    slot: string,
  ) => rows.find((row) => row.slot === slot)?.playerId

  it("fills empty actives with off-nights; Sit and PV stay down", () => {
    const rows = buildLineupDisplayRows(roster, ["streamer"], [], focus)

    expect(rows.map((row) => row.slot)).toEqual([
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
      "UTIL",
      "BE",
      "IL",
      "PV",
    ])
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "SF")).toBe("c")
    expect(occupant(rows, "PF")).toBe("e")
    expect(occupant(rows, "C")).toBe("d")
    expect(occupant(rows, "UTIL")).toBe("f")
    expect(rows.filter((row) => row.slot === "BE").every((row) => row.playerId === null)).toBe(
      true,
    )
    expect(occupant(rows, "IL")).toBe("injured")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })

  it("starts a playing player missing from daily when an eligible active is empty", () => {
    const daily: DailyLineups = {
      [mon]: mondayStarts[mon]!.map((entry) =>
        entry.slot === "C" ? { ...entry, playerId: null } : entry,
      ),
    }
    const rows = buildLineupDisplayRows(roster, [], [], { ...focus, daily })
    expect(rows.find((row) => row.playerId === "d")?.slot).not.toBe("BE")
    expect(
      rows.some(
        (row) =>
          row.playerId === "d" &&
          row.slot !== "BE" &&
          row.slot !== "IL" &&
          row.slot !== "PV",
      ),
    ).toBe(true)
    expect(daily[mon]?.find((entry) => entry.slot === "C")?.playerId).toBeNull()
  })

  it("starts a playing player missing from daily instead of leaving them on BE", () => {
    const daily: DailyLineups = {
      [mon]: mondayStarts[mon]!.map((entry) =>
        entry.slot === "PG" ? { ...entry, playerId: null } : entry,
      ),
    }
    const rows = buildLineupDisplayRows(roster, [], [], { ...focus, daily })
    expect(rows.find((row) => row.playerId === "a")?.slot).not.toBe("BE")
    expect(occupant(rows, "PG")).toBe("a")
  })

  it("does not write an off-night fill into daily", () => {
    const rows = buildLineupDisplayRows(roster, [], [], focus)
    expect(occupant(rows, "SG")).toBe("b")
    expect(focus.daily[mon]?.find((entry) => entry.slot === "SG")?.playerId).toBeNull()
  })

  it("re-seats Tuesday starts and fills leftover actives with off-nights", () => {
    const daily: DailyLineups = {
      ...mondayStarts,
      [tue]: [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: "b" },
        { slot: "SF", playerId: null },
        { slot: "PF", playerId: "e" },
        { slot: "C", playerId: null },
        { slot: "UTIL", playerId: null },
      ],
    }
    const rows = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      focusDay: tue,
      daily,
    })
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "PF")).toBe("e")
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SF")).toBe("c")
    expect(occupant(rows, "C")).toBe("d")
    expect(occupant(rows, "UTIL")).toBe("f")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })

  it("keeps a started preview on the engine slot and a full-day preview on PV", () => {
    const daily: DailyLineups = {
      [mon]: [
        { slot: "PG", playerId: "a" },
        { slot: "SG", playerId: "b" },
        { slot: "SF", playerId: "c" },
        { slot: "PF", playerId: "e" },
        { slot: "C", playerId: "d" },
        { slot: "UTIL", playerId: "f" },
      ],
    }
    const full = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      daily,
    })
    expect(occupant(full, "PF")).toBe("e")
    expect(full.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])

    const withStart = buildLineupDisplayRows(roster, ["streamer"], [], {
      ...focus,
      daily: {
        [mon]: [
          { slot: "PG", playerId: "a" },
          { slot: "SG", playerId: null },
          { slot: "SF", playerId: "c" },
          { slot: "PF", playerId: "streamer" },
          { slot: "C", playerId: "d" },
          { slot: "UTIL", playerId: "f" },
        ],
      },
    })
    expect(occupant(withStart, "PF")).toBe("streamer")
    expect(withStart.filter((row) => row.slot === "PV")).toHaveLength(0)
  })

  it("keeps IL on the IL row even when that player has a game", () => {
    const rows = buildLineupDisplayRows(roster, [], [], focus)
    expect(rows.find((row) => row.playerId === "injured")?.slot).toBe("IL")
  })

  it("leaves home-row occupants when focus inputs are omitted", () => {
    const rows = buildLineupDisplayRows(roster, ["streamer"])
    expect(occupant(rows, "PG")).toBe("a")
    expect(occupant(rows, "SG")).toBe("b")
    expect(occupant(rows, "PF")).toBeNull()
    expect(occupant(rows, "UTIL")).toBe("e")
    expect(occupant(rows, "BE")).toBe("f")
    expect(rows.filter((row) => row.slot === "PV").map((row) => row.playerId)).toEqual([
      "streamer",
    ])
  })
})

describe("buildDayLineupFromRoster keeps playing roster players", () => {
  it("seats a roster player on a B2B second night when the slot is empty", () => {
    const b2bSchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2026-03-09",
        endDate: "2026-03-10",
        days: ["2026-03-09", "2026-03-10"],
      },
      games: [
        { date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2026-03-10", homeAbbr: "BOS", awayAbbr: "MIA" },
      ],
    }
    const starter: SeasonPlayer = {
      ...star,
      id: "starter-b2b",
      teamAbbr: "BOS",
      positions: ["PG"],
    }
    const entries: SeasonRosterEntry[] = [
      { slot: "PG", playerId: "starter-b2b" },
      { slot: "SG", playerId: null },
    ]
    const first = buildDayLineupFromRoster(
      "2026-03-09",
      entries,
      [starter],
      b2bSchedule,
      ["PG", "SG"],
    )
    const second = buildDayLineupFromRoster(
      "2026-03-10",
      entries,
      [starter],
      b2bSchedule,
      ["PG", "SG"],
    )
    expect(first.some((entry) => entry.playerId === "starter-b2b")).toBe(true)
    expect(second.some((entry) => entry.playerId === "starter-b2b")).toBe(true)
  })

  it("moves a playing roster player into a slot whose occupant has no game", () => {
    const daySchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2026-03-09",
        endDate: "2026-03-09",
        days: ["2026-03-09"],
      },
      games: [{ date: "2026-03-09", homeAbbr: "BOS", awayAbbr: "NYK" }],
    }
    const playing: SeasonPlayer = {
      ...star,
      id: "playing",
      teamAbbr: "BOS",
      positions: ["SG"],
    }
    const idle: SeasonPlayer = {
      ...scrub,
      id: "idle",
      teamAbbr: "CHI",
      positions: ["PG"],
    }
    const lineup = buildDayLineupFromRoster(
      "2026-03-09",
      [
        { slot: "PG", playerId: "idle" },
        { slot: "SG", playerId: "playing" },
      ],
      [playing, idle],
      daySchedule,
      ["PG", "SG"],
    )
    expect(lineup.some((entry) => entry.playerId === "playing")).toBe(true)
    expect(lineup.some((entry) => entry.playerId === "idle")).toBe(false)
  })

  it("starts a playing bench player into an eligible empty slot", () => {
    const day = "2026-03-11"
    const daySchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: day,
        endDate: day,
        days: [day],
      },
      games: [{ date: day, homeAbbr: "BOS", awayAbbr: "NYK" }],
    }
    const benchPlay: SeasonPlayer = {
      ...star,
      id: "bench-play",
      teamAbbr: "BOS",
      positions: ["PG"],
    }
    const lineup = buildDayLineupFromRoster(
      day,
      [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: null },
        { slot: "BE", playerId: "bench-play" },
      ],
      [benchPlay],
      daySchedule,
      ["PG", "SG", "BE"],
    )
    expect(lineup.some((entry) => entry.playerId === "bench-play")).toBe(true)
    expect(lineup.find((entry) => entry.playerId === "bench-play")?.slot).not.toBe(
      "BE",
    )
  })

  it("may sit an 11th playing player only when ten other playing actives are filled", () => {
    const day = "2026-03-11"
    const teams = [
      "BOS",
      "NYK",
      "MIA",
      "CHI",
      "ATL",
      "ORL",
      "CLE",
      "DET",
      "SAS",
      "MIL",
      "WAS",
    ] as const
    const slots = [
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
      "G",
      "F",
      "UTIL",
      "UTIL",
      "UTIL",
      "BE",
    ] as const
    const makers = teams.map((teamAbbr, index) => ({
      player: {
        ...star,
        id: `pack-${index}`,
        teamAbbr,
        positions: ["PG", "SG", "SF", "PF", "C", "G", "F"] as SeasonPosition[],
      },
      slot: slots[index]!,
    }))
    const daySchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: day,
        endDate: day,
        days: [day],
      },
      games: teams.slice(0, 10).map((homeAbbr, index) => ({
        date: day,
        homeAbbr,
        awayAbbr: teams[index + 1] ?? "PHI",
      })),
    }
    const lineup = buildDayLineupFromRoster(
      day,
      makers.map(({ player, slot }) => ({ slot, playerId: player.id })),
      makers.map(({ player }) => player),
      daySchedule,
      [...slots],
    )
    const started = lineup
      .map((entry) => entry.playerId)
      .filter((playerId): playerId is string => Boolean(playerId))
    expect(started).toHaveLength(10)
    expect(started).not.toContain("pack-10")
    expect(
      lineup.every((entry) => {
        if (!entry.playerId) return false
        const player = makers.find((row) => row.player.id === entry.playerId)
        return Boolean(player && player.player.teamAbbr !== "WAS")
      }),
    ).toBe(true)
  })
})

describe("daily sit/start reseat rules", () => {
  const day = "2026-03-12"
  const makePlayer = (
    id: string,
    teamAbbr: string,
    positions: SeasonPosition[],
  ): SeasonPlayer => ({
    ...star,
    id,
    name: id,
    teamAbbr,
    positions,
  })

  it("starts a B2B night-2 player into an eligible empty slot", () => {
    const b2bSchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2026-03-11",
        endDate: day,
        days: ["2026-03-11", day],
      },
      games: [
        { date: "2026-03-11", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: day, homeAbbr: "BOS", awayAbbr: "MIA" },
      ],
    }
    const nightTwo = makePlayer("night-two", "BOS", ["PG"])
    const lineup = buildDayLineupFromRoster(
      day,
      [
        { slot: "PG", playerId: null },
        { slot: "BE", playerId: "night-two" },
      ],
      [nightTwo],
      b2bSchedule,
      ["PG", "BE"],
    )
    expect(lineup.some((entry) => entry.playerId === "night-two")).toBe(true)

    const started = togglePlayerDay(
      { [day]: [{ slot: "PG", playerId: null }] },
      day,
      "night-two",
      true,
      { "night-two": nightTwo },
      undefined,
      b2bSchedule,
    )
    expect(started.status).toBe("started")
    expect(started.daily[day]?.some((entry) => entry.playerId === "night-two")).toBe(
      true,
    )
  })

  it("treats a 0.75 occupant as filling the slot for full-night checks", () => {
    const b2bSchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: "2026-03-11",
        endDate: day,
        days: ["2026-03-11", day],
      },
      games: [
        { date: "2026-03-11", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: day, homeAbbr: "BOS", awayAbbr: "MIA" },
      ],
    }
    const occupant = makePlayer("b2b-occ", "BOS", ["PG"])
    const extra = makePlayer("extra-play", "NYK", ["SG"])
    const entries = [{ slot: "PG" as const, playerId: "b2b-occ" }]
    const daily = { [day]: entries }
    const playersById = { "b2b-occ": occupant, "extra-play": extra }

    expect(isDailyLineupFullForDate(daily, day, playersById, b2bSchedule)).toBe(
      true,
    )
    const blocked = togglePlayerDay(
      daily,
      day,
      "extra-play",
      true,
      playersById,
      undefined,
      b2bSchedule,
    )
    expect(blocked.status).toBe("full")
  })

  it("does not display a no-game occupant over a playing player missing from daily", () => {
    const displayDay = "2026-03-12"
    const displaySchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: displayDay,
        endDate: displayDay,
        days: [displayDay],
      },
      games: [{ date: displayDay, homeAbbr: "BOS", awayAbbr: "NYK" }],
    }
    const playing = makePlayer("disp-play", "BOS", ["SG"])
    const idle = makePlayer("disp-idle", "CHI", ["PG"])
    const roster: SeasonRosterEntry[] = [
      { slot: "PG", playerId: "disp-idle" },
      { slot: "SG", playerId: "disp-play" },
      { slot: "BE", playerId: null },
    ]
    const rows = buildLineupDisplayRows(roster, [], [], {
      focusDay: displayDay,
      schedule: displaySchedule,
      playersById: { "disp-play": playing, "disp-idle": idle },
      daily: {
        [displayDay]: [
          { slot: "PG", playerId: "disp-idle" },
          { slot: "SG", playerId: null },
        ],
      },
    })
    expect(rows.find((row) => row.playerId === "disp-play")?.slot).not.toBe("BE")
    expect(rows.some((row) => row.slot !== "BE" && row.playerId === "disp-play")).toBe(
      true,
    )
    expect(
      rows.some((row) => row.slot !== "BE" && row.slot !== "IL" && row.playerId === "disp-idle") &&
        rows.find((row) => row.playerId === "disp-play")?.slot === "BE",
    ).toBe(false)
  })

  it("may show an 11th playing player on BE when ten playing actives are filled", () => {
    const packedDay = "2026-03-12"
    const teams = [
      "BOS",
      "NYK",
      "MIA",
      "CHI",
      "ATL",
      "ORL",
      "CLE",
      "DET",
      "SAS",
      "MIL",
      "WAS",
    ] as const
    const slots = [
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
      "G",
      "F",
      "UTIL",
      "UTIL",
      "UTIL",
      "BE",
    ] as const
    const rosterPlayers = teams.map((teamAbbr, index) =>
      makePlayer(`row-${index}`, teamAbbr, ["PG", "SG", "SF", "PF", "C", "G", "F"]),
    )
    const packedSchedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: packedDay,
        endDate: packedDay,
        days: [packedDay],
      },
      games: teams.slice(0, 10).map((homeAbbr, index) => ({
        date: packedDay,
        homeAbbr,
        awayAbbr: teams[index + 1] ?? "PHI",
      })),
    }
    const roster: SeasonRosterEntry[] = slots.map((slot, index) => ({
      slot,
      playerId: rosterPlayers[index]!.id,
    }))
    const daily: DailyLineups = {
      [packedDay]: slots.slice(0, 10).map((slot, index) => ({
        slot,
        playerId: rosterPlayers[index]!.id,
      })),
    }
    const rows = buildLineupDisplayRows(roster, [], [], {
      focusDay: packedDay,
      schedule: packedSchedule,
      playersById: Object.fromEntries(
        rosterPlayers.map((entry) => [entry.id, entry]),
      ),
      daily,
    })
    expect(rows.find((row) => row.playerId === "row-10")?.slot).toBe("BE")
    expect(
      rows.filter(
        (row) =>
          row.slot !== "BE" &&
          row.slot !== "IL" &&
          row.slot !== "PV" &&
          row.playerId,
      ),
    ).toHaveLength(10)
  })

  it("starts a G-only player into an empty PG instead of leaving them Sit", () => {
    const guard = makePlayer("flex-g", "BOS", ["G"])
    const lineup = buildDayLineupFromRoster(
      day,
      [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: null },
        { slot: "BE", playerId: "flex-g" },
      ],
      [guard],
      {
        source: "fixture",
        matchup: { scoringPeriodId: 1, startDate: day, endDate: day, days: [day] },
        games: [{ date: day, homeAbbr: "BOS", awayAbbr: "NYK" }],
      },
      ["PG", "SG", "BE"],
    )
    expect(lineup.some((entry) => entry.playerId === "flex-g")).toBe(true)
    expect(lineup.find((entry) => entry.playerId === "flex-g")?.slot).toBe("PG")
  })

  it("starts a playing player into a no-game occupant's slot", () => {
    const playing = makePlayer("flex-play", "BOS", ["G"])
    const idle = makePlayer("flex-idle", "CHI", ["PG"])
    const lineup = buildDayLineupFromRoster(
      day,
      [
        { slot: "PG", playerId: "flex-idle" },
        { slot: "BE", playerId: "flex-play" },
      ],
      [playing, idle],
      {
        source: "fixture",
        matchup: { scoringPeriodId: 1, startDate: day, endDate: day, days: [day] },
        games: [{ date: day, homeAbbr: "BOS", awayAbbr: "NYK" }],
      },
      ["PG", "BE"],
    )
    expect(lineup.some((entry) => entry.playerId === "flex-play")).toBe(true)
    expect(lineup.some((entry) => entry.playerId === "flex-idle")).toBe(false)
  })

  it("keeps an IL player off the active lineup even when they have a game", () => {
    const injured = makePlayer("il-play", "BOS", ["PG"])
    const lineup = buildDayLineupFromRoster(
      day,
      [
        { slot: "PG", playerId: null },
        { slot: "IL", playerId: "il-play" },
      ],
      [injured],
      {
        source: "fixture",
        matchup: { scoringPeriodId: 1, startDate: day, endDate: day, days: [day] },
        games: [{ date: day, homeAbbr: "BOS", awayAbbr: "NYK" }],
      },
      ["PG", "IL"],
    )
    expect(lineup.some((entry) => entry.playerId === "il-play")).toBe(false)
  })

  it("refills a stale stored daily so a playing player is no longer Sit", () => {
    const guard = makePlayer("stale-g", "BOS", ["G"])
    const stored: DailyLineups = {
      [day]: [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: null },
      ],
    }
    const filled = autofillOpenSlotsFromRoster(
      stored,
      {
        source: "fixture",
        matchup: { scoringPeriodId: 1, startDate: day, endDate: day, days: [day] },
        games: [{ date: day, homeAbbr: "BOS", awayAbbr: "NYK" }],
      },
      [guard],
      [
        { slot: "PG", playerId: null },
        { slot: "SG", playerId: null },
        { slot: "BE", playerId: "stale-g" },
      ],
      ["PG", "SG", "BE"],
    )
    expect(filled[day]?.some((entry) => entry.playerId === "stale-g")).toBe(true)
  })

  it("displays a G-only playing player as Start when PG is empty", () => {
    const guard = makePlayer("grid-g", "BOS", ["G"])
    const rows = buildLineupDisplayRows(
      [
        { slot: "PG", playerId: null },
        { slot: "BE", playerId: "grid-g" },
      ],
      [],
      [],
      {
        focusDay: day,
        schedule: {
          source: "fixture",
          matchup: {
            scoringPeriodId: 1,
            startDate: day,
            endDate: day,
            days: [day],
          },
          games: [{ date: day, homeAbbr: "BOS", awayAbbr: "NYK" }],
        },
        playersById: { "grid-g": guard },
        daily: {
          [day]: [{ slot: "PG", playerId: null }],
        },
      },
    )
    expect(rows.find((row) => row.playerId === "grid-g")?.slot).toBe("PG")
  })
})
