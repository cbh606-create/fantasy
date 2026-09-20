import { describe, expect, it } from "vitest"
import { initDailyLineups } from "@/lib/matchup/dailyLineups"
import {
  buildHoleDayLineup,
  countHoleB2bPairs,
  countOpenActiveSlots,
  countTeamStarts,
  holeWindowTier,
  pickAutoRosterCut,
  playerHasEligibleHole,
  remainingHoleStarts,
} from "@/lib/matchup/streamingHoleCalendar"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

const projections = (): SeasonPlayer["projections"] => ({
  FG_PCT: 0.48,
  FT_PCT: 0.78,
  TPM: 80,
  REB: 300,
  AST: 250,
  STL: 60,
  BLK: 30,
  TO: 100,
  PTS: 1400,
})

const shooting = (): SeasonPlayer["shooting"] => ({
  FGM: 500,
  FGA: 1040,
  FTM: 200,
  FTA: 260,
})

const player = (
  id: string,
  teamAbbr: string,
  overrides: Partial<SeasonPlayer> = {},
): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  availability: "fa",
  positions: ["PF", "F"],
  projections: projections(),
  shooting: shooting(),
  ...overrides,
})

const slots = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL"] as const

const emptyActives = (): SeasonRosterEntry[] =>
  slots.map((slot) => ({ slot, playerId: null }))

const scheduleOf = (
  days: string[],
  games: ScheduleResponse["games"],
): ScheduleResponse => ({
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    days,
  },
  games,
})

describe("buildHoleDayLineup", () => {
  it("marks a night packed when ten roster games fill every active", () => {
    const day = "2025-10-23"
    const teams = ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA", "CHI", "BOS"] as const
    const positions = [
      ["PG"],
      ["SG"],
      ["SF"],
      ["PF"],
      ["C"],
      ["PG", "SG"],
      ["SF", "PF"],
      ["SG"],
      ["PG"],
      ["SF"],
    ] as const
    const players = teams.map((team, index) =>
      player(`r${index}`, team, { positions: [...positions[index]!] }),
    )
    const entries = players.map((rostered, index) => ({
      slot: slots[index]!,
      playerId: rostered.id,
    }))
    const schedule = scheduleOf([day], teams.map((homeAbbr) => ({
      date: day,
      homeAbbr,
      awayAbbr: "SAC",
    })))
    const lineup = buildHoleDayLineup({
      day,
      teamEntries: entries,
      players,
      schedule,
    })
    expect(countOpenActiveSlots(lineup)).toBe(0)
  })

  it("opens a hole when the saved daily sat a rostered starter", () => {
    const day = "2025-10-21"
    const pf = player("r-pf", "LAL", { positions: ["PF"] })
    const pg = player("r-pg", "NYK", { positions: ["PG"] })
    const entries: SeasonRosterEntry[] = [
      { slot: "PG", playerId: "r-pg" },
      { slot: "PF", playerId: "r-pf" },
    ]
    const schedule = scheduleOf([day], [
      { date: day, homeAbbr: "LAL", awayAbbr: "BOS" },
      { date: day, homeAbbr: "NYK", awayAbbr: "CHI" },
    ])
    const seated = buildHoleDayLineup({
      day,
      teamEntries: entries,
      players: [pf, pg],
      schedule,
    })
    const savedDay = seated.map((entry) =>
      entry.playerId === "r-pf" ? { ...entry, playerId: null } : entry,
    )
    const withSit = buildHoleDayLineup({
      day,
      teamEntries: entries,
      players: [pf, pg],
      schedule,
      savedDay,
    })
    expect(playerHasEligibleHole(pf, seated)).toBe(false)
    expect(playerHasEligibleHole(pf, withSit)).toBe(true)
  })

  it("does not seat a plan-cut id", () => {
    const day = "2025-10-21"
    const bench = player("r-be", "DET", { positions: ["PF"] })
    const lineup = buildHoleDayLineup({
      day,
      teamEntries: [{ slot: "PF", playerId: "r-be" }],
      players: [bench],
      schedule: scheduleOf([day], [
        { date: day, homeAbbr: "DET", awayAbbr: "CHA" },
      ]),
      cutPlayerIds: new Set(["r-be"]),
    })
    expect(lineup.some((entry) => entry.playerId === "r-be")).toBe(false)
  })

  it("uses the saved lineup as truth instead of repacking a bench game", () => {
    const day = "2025-10-23"
    const starters = slots.map((slot, index) =>
      player(`starter-${index}`, `T${index}`, {
        positions: slot === "UTIL" ? ["PG"] : [slot],
      }),
    )
    const bench = player("bench-game", "BEN", { positions: ["PG"] })
    const savedDay = starters.map((starter, index) => ({
      slot: slots[index]!,
      playerId: index === 9 ? null : starter.id,
    }))
    const lineup = buildHoleDayLineup({
      day,
      teamEntries: [
        { slot: "BE", playerId: bench.id },
        ...[...starters.slice(1), starters[0]!].map((starter, index) => ({
          slot: slots[index]!,
          playerId: starter.id,
        })),
      ],
      players: [...starters, bench],
      schedule: scheduleOf([day], [
        ...starters.map((starter) => ({
          date: day,
          homeAbbr: starter.teamAbbr!,
          awayAbbr: "SAC",
        })),
        { date: day, homeAbbr: "BEN", awayAbbr: "WAS" },
      ]),
      savedDay,
    })

    expect(countOpenActiveSlots(lineup)).toBe(1)
    expect(lineup.some((entry) => entry.playerId === bench.id)).toBe(false)
  })
})

describe("playerHasEligibleHole", () => {
  it("ignores empty bench and IL slots", () => {
    const pf = player("r-pf", "LAL", { positions: ["PF"] })
    const benchOnly: SeasonRosterEntry[] = [
      { slot: "BE", playerId: null },
      { slot: "IL", playerId: null },
    ]
    expect(playerHasEligibleHole(pf, benchOnly)).toBe(false)
  })

  it("counts UTIL as a hole when a specific slot the FA cannot play is empty", () => {
    const guard = player("guard", "LAL", { positions: ["PG"] })
    const lineup: SeasonRosterEntry[] = [
      { slot: "C", playerId: null },
      { slot: "UTIL", playerId: null },
    ]

    expect(playerHasEligibleHole(guard, lineup)).toBe(true)
  })
})

describe("remainingHoleStarts", () => {
  it("skips an NBA game on a packed night", () => {
    const days = ["2025-10-21", "2025-10-23"]
    const fa = player("fa-okc", "OKC", { positions: ["PF"] })
    const openPf = emptyActives().map((entry) =>
      entry.slot === "PF" ? entry : { ...entry, playerId: "r-fill" },
    )
    const packed = emptyActives().map((entry, index) => ({
      ...entry,
      playerId: `r${index}`,
    }))
    const holeByDate = {
      "2025-10-21": openPf,
      "2025-10-23": packed,
    }
    const schedule = scheduleOf(days, [
      { date: "2025-10-21", homeAbbr: "OKC", awayAbbr: "WAS" },
      { date: "2025-10-23", homeAbbr: "OKC", awayAbbr: "ORL" },
    ])
    expect(remainingHoleStarts(fa, "2025-10-21", days, holeByDate, schedule)).toBe(1)
  })
})

describe("holeWindowTier", () => {
  const days = [
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
  ]
  const open = emptyActives()
  const holeByDate = Object.fromEntries(days.map((day) => [day, open]))

  it("labels 3-in-4 elite, B2B strong, 2-in-3 ok, and a single game thin", () => {
    const elite = player("fa-elite", "BOS")
    const b2b = player("fa-b2b", "NYK")
    const twoInThree = player("fa-ok", "CHI")
    const thin = player("fa-thin", "DET")
    const schedule = scheduleOf(days, [
      { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
      { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
      { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "MIA" },
      { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ATL" },
      { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "BKN" },
      { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "MIL" },
      { date: "2025-11-05", homeAbbr: "CHI", awayAbbr: "IND" },
      { date: "2025-11-03", homeAbbr: "DET", awayAbbr: "CHA" },
    ])
    expect(holeWindowTier(elite, days[0]!, days, holeByDate, schedule)).toBe(
      "elite",
    )
    expect(holeWindowTier(b2b, days[0]!, days, holeByDate, schedule)).toBe(
      "strong",
    )
    expect(holeWindowTier(twoInThree, days[0]!, days, holeByDate, schedule)).toBe(
      "ok",
    )
    expect(holeWindowTier(thin, days[0]!, days, holeByDate, schedule)).toBe(
      "thin",
    )
  })
})

describe("countHoleB2bPairs", () => {
  it("counts only adjacent hole nights the FA can sit", () => {
    const days = ["2025-10-20", "2025-10-21", "2025-10-23"]
    const fa = player("fa-b2b", "CHI", { positions: ["PF"] })
    const openPf = emptyActives()
    const holeByDate = {
      "2025-10-20": openPf,
      "2025-10-21": openPf,
      "2025-10-23": openPf,
    }
    const schedule = scheduleOf(days, [
      { date: "2025-10-20", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "NYK" },
      { date: "2025-10-23", homeAbbr: "CHI", awayAbbr: "BOS" },
    ])
    expect(countHoleB2bPairs(fa, "2025-10-20", days, holeByDate, schedule)).toBe(1)
  })
})

describe("countTeamStarts", () => {
  it("counts seated games only", () => {
    const days = ["2025-10-21"]
    const starter = player("you-1", "CHI", { positions: ["SG"] })
    const sat = player("you-2", "NYK", { positions: ["PG"] })
    const schedule = scheduleOf(days, [
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "DET" },
      { date: "2025-10-21", homeAbbr: "NYK", awayAbbr: "BOS" },
    ])
    const daily = initDailyLineups(
      days,
      [
        { slot: "SG", playerId: "you-1" },
        { slot: "PG", playerId: "you-2" },
      ],
      undefined,
      [starter, sat],
      schedule,
    )
    daily["2025-10-21"] = daily["2025-10-21"]!.map((entry) =>
      entry.playerId === "you-2" ? { ...entry, playerId: null } : entry,
    )
    expect(countTeamStarts(daily, [starter, sat], schedule)).toBe(1)
  })
})

describe("pickAutoRosterCut", () => {
  it("skips tonight starters and prefers zero remaining games", () => {
    const days = ["2025-10-21", "2025-10-22"]
    const starter = player("r-on", "CHI", { positions: ["SG"] })
    const leftover = player("r-zero", "DET", { positions: ["PF"] })
    const later = player("r-later", "NYK", { positions: ["PG"] })
    const schedule = scheduleOf(days, [
      { date: "2025-10-21", homeAbbr: "CHI", awayAbbr: "BOS" },
      { date: "2025-10-22", homeAbbr: "NYK", awayAbbr: "BOS" },
    ])
    const seatedTonight: SeasonRosterEntry[] = [
      { slot: "SG", playerId: "r-on" },
      { slot: "PF", playerId: null },
    ]
    const cut = pickAutoRosterCut({
      date: "2025-10-21",
      days,
      teamEntries: [
        { slot: "SG", playerId: "r-on" },
        { slot: "BE", playerId: "r-zero" },
        { slot: "BE", playerId: "r-later" },
      ],
      players: [starter, leftover, later],
      schedule,
      seatedTonight,
    })
    expect(cut).toBe("r-zero")
  })

  it("does not auto-cut an ADP-60 roster star", () => {
    const days = ["2025-10-21", "2025-10-22"]
    const reaves = player("r-reaves", "LAL", { positions: ["SG"] })
    const streamer = player("r-be", "DET", { positions: ["PF"] })
    const schedule = scheduleOf(days, [
      { date: "2025-10-22", homeAbbr: "LAL", awayAbbr: "BOS" },
      { date: "2025-10-22", homeAbbr: "DET", awayAbbr: "CHA" },
    ])
    const cut = pickAutoRosterCut({
      date: "2025-10-21",
      days,
      teamEntries: [
        { slot: "SG", playerId: "r-reaves" },
        { slot: "BE", playerId: "r-be" },
      ],
      players: [reaves, streamer],
      schedule,
      seatedTonight: [{ slot: "PG", playerId: null }],
      adpByPlayerId: { "r-reaves": 38, "r-be": 140 },
    })
    expect(cut).toBe("r-be")
  })

  it("counts remaining games from date onward only", () => {
    const days = ["2025-10-20", "2025-10-21", "2025-10-22"]
    const date = "2025-10-21"
    const pastOnly = player("r-past", "DET", { positions: ["PF"] })
    const futureGame = player("r-future", "NYK", { positions: ["PG"] })
    const schedule = scheduleOf(days, [
      { date: "2025-10-20", homeAbbr: "DET", awayAbbr: "BOS" },
      { date: "2025-10-22", homeAbbr: "NYK", awayAbbr: "BOS" },
    ])
    const cut = pickAutoRosterCut({
      date,
      days,
      teamEntries: [
        { slot: "BE", playerId: "r-past" },
        { slot: "BE", playerId: "r-future" },
      ],
      players: [pastOnly, futureGame],
      schedule,
      seatedTonight: [],
    })
    expect(cut).toBe("r-past")
  })
})
