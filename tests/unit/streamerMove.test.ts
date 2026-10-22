import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import {
  applyStreamerMoveToDaily,
  pickBestStreamerMove,
  planningMatchupBoard,
  scoreStreamerMove,
  seatStreamerIfOpen,
} from "@/lib/matchup/streamerMove"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type { MatchupBoard } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const DAY = "2025-11-03"
const DAY2 = "2025-11-04"

const emptyActive = (): SeasonRosterEntry[] =>
  (["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL"] as const).map(
    (slot) => ({ slot, playerId: null }),
  )

const player = (id: string, teamAbbr: string, positions: SeasonPlayer["positions"] = ["C"]): SeasonPlayer => ({
  id,
  name: id,
  teamAbbr,
  positions,
  projections: {
    FG_PCT: 0.5, FT_PCT: 0.8, TPM: 1, REB: 5, AST: 2, STL: 1, BLK: 1, TO: 2, PTS: 10,
  },
  shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2.5 },
})

describe("applyStreamerMoveToDaily", () => {
  it("does not seat into an ineligible slot even when allowFlexSlots is true", () => {
    const center = player("fa-c", "BOS", ["C"])
    const entries: SeasonRosterEntry[] = [
      { slot: "PG", playerId: null },
      { slot: "SG", playerId: null },
    ]
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [{ date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" }],
    }
    const seated = seatStreamerIfOpen(
      entries,
      "fa-c",
      DAY,
      { "fa-c": center },
      schedule,
      { allowFlexSlots: true },
    )
    expect(seated).toBe(false)
    expect(entries.every((entry) => entry.playerId === null)).toBe(true)
  })

  it("slides a starter into the open hole so a flex add can use their slot", () => {
    const center = player("fa-c", "BOS", ["C"])
    const forward = player("util-pf", "MIA", ["PF"])
    const entries: SeasonRosterEntry[] = [
      { slot: "PF", playerId: null },
      { slot: "UTIL", playerId: "util-pf" },
    ]
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "MIA", awayAbbr: "NYK" },
      ],
    }
    const seated = seatStreamerIfOpen(
      entries,
      "fa-c",
      DAY,
      { "fa-c": center, "util-pf": forward },
      schedule,
      { allowFlexSlots: true },
    )
    expect(seated).toBe(true)
    expect(entries).toEqual([
      { slot: "PF", playerId: "util-pf" },
      { slot: "UTIL", playerId: "fa-c" },
    ])
  })

  it("still seats later game days when fromDate has no eligible slot", () => {
    const fa = player("fa-c", "BOS", ["C"])
    const filler = (id: string, team: string, positions: SeasonPlayer["positions"]) =>
      player(id, team, positions)
    // Day 1: only PG/SG open (center cannot sit). Day 2: C open.
    const d1 = emptyActive().map((entry, index) => {
      if (entry.slot === "PG" || entry.slot === "SG") return entry
      const teams = ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA"] as const
      const slotIndex = ["SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL"].indexOf(
        entry.slot,
      )
      if (slotIndex < 0) return entry
      return {
        ...entry,
        playerId: `occ-${index}`,
      }
    })
    const occPlayers = d1
      .filter((entry) => entry.playerId)
      .map((entry, index) =>
        filler(
          entry.playerId!,
          ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA"][index]!,
          ["UTIL"],
        ),
      )
    const d2 = emptyActive()
    const daily: DailyLineups = { [DAY]: d1, [DAY2]: d2 }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "MIA" },
        ...occPlayers.map((p) => ({
          date: DAY,
          homeAbbr: p.teamAbbr!,
          awayAbbr: "ORL",
        })),
      ],
    }
    const playersById = Object.fromEntries([
      ...occPlayers.map((p) => [p.id, p] as const),
      ["fa-c", fa] as const,
    ])
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "fa-c",
      { kind: "none", playerId: null },
      playersById,
      schedule,
    )
    expect(result.daily[DAY]!.some((e) => e.playerId === "fa-c")).toBe(false)
    expect(result.daily[DAY2]!.some((e) => e.playerId === "fa-c")).toBe(true)
    expect(result.seatedGameDays).toBe(1)
  })

  it("does not clear a roster drop when the add cannot seat any day", () => {
    const dropP = player("bench", "NYK", ["PF"])
    const fa = player("fa-c", "BOS", ["C"])
    const d1: SeasonRosterEntry[] = [
      { slot: "PG", playerId: null },
      { slot: "SG", playerId: null },
      { slot: "PF", playerId: "bench" },
    ]
    const daily: DailyLineups = { [DAY]: d1 }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
      ],
    }
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "fa-c",
      { kind: "player", playerId: "bench" },
      { bench: dropP, "fa-c": fa },
      schedule,
    )
    expect(result.seatedGameDays).toBe(0)
    expect(result.daily[DAY]!.some((e) => e.playerId === "bench")).toBe(true)
  })

  it("clears a roster drop from fromDate onward and seats the FA on open game days", () => {
    const dropP = player("bench", "NYK", ["PF"])
    const fa = player("fa-bos", "BOS", ["C"])
    const d1 = emptyActive()
    d1[3] = { slot: "PF", playerId: "bench" }
    const d2 = emptyActive()
    d2[3] = { slot: "PF", playerId: "bench" }
    const daily: DailyLineups = { [DAY]: d1, [DAY2]: d2 }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
        { date: DAY2, homeAbbr: "NYK", awayAbbr: "ORL" },
      ],
    }
    const playersById = { bench: dropP, "fa-bos": fa }
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "fa-bos",
      { kind: "player", playerId: "bench" },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(2)
    expect(result.daily[DAY]!.some((e) => e.playerId === "bench")).toBe(false)
    expect(result.daily[DAY2]!.some((e) => e.playerId === "bench")).toBe(false)
    expect(result.daily[DAY]!.some((e) => e.playerId === "fa-bos")).toBe(true)
    expect(result.daily[DAY2]!.some((e) => e.playerId === "fa-bos")).toBe(true)
  })

  it("does not displace a game-day starter when the add-day is full", () => {
    const roster = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].map(
      (id, i) => player(id, ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA", "CHI", "BOS"][i]!, ["UTIL"]),
    )
    const entries = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: roster[index]!.id,
    }))
    const fa = player("fa-was", "WAS", ["C"])
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "PHX", awayAbbr: "DEN" },
        { date: DAY, homeAbbr: "MIL", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "WAS", awayAbbr: "TOR" },
      ],
    }
    const playersById = Object.fromEntries([
      ...roster.map((p) => [p.id, p] as const),
      ["fa-was", fa] as const,
    ])
    const result = applyStreamerMoveToDaily(
      { [DAY]: entries },
      DAY,
      "fa-was",
      { kind: "none", playerId: null },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(0)
    expect(result.daily[DAY]!.some((e) => e.playerId === "fa-was")).toBe(false)
    expect(result.daily[DAY]!.map((e) => e.playerId)).toEqual(entries.map((e) => e.playerId))
  })

  it("skips an ineligible add-day slot but still seats a later eligible day", () => {
    const starters = [
      player("pg", "NYK", ["PG"]),
      player("sg", "LAL", ["SG"]),
      player("sf", "BOS", ["SF"]),
      player("c", "CHI", ["C"]),
      player("g", "MIA", ["PG"]),
      player("f", "ATL", ["SF"]),
      player("u1", "DEN", ["SG"]),
      player("u2", "GSW", ["SF"]),
      player("u3", "MIL", ["PG"]),
    ]
    const dayEntries = emptyActive()
    const filled = [0, 1, 2, 4, 5, 6, 7, 8, 9]
    filled.forEach((index, i) => {
      dayEntries[index] = { ...dayEntries[index]!, playerId: starters[i]!.id }
    })
    const laterEntries = emptyActive()
    const guard = player("carrington", "WAS", ["PG", "SG"])
    const daily: DailyLineups = { [DAY]: dayEntries, [DAY2]: laterEntries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
      games: [
        { date: DAY, homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "BOS" },
        { date: DAY, homeAbbr: "MIA", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "DEN", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "MIL", awayAbbr: "ORL" },
        { date: DAY, homeAbbr: "WAS", awayAbbr: "TOR" },
        { date: DAY2, homeAbbr: "WAS", awayAbbr: "CHA" },
      ],
    }
    const playersById = Object.fromEntries([
      ...starters.map((entry) => [entry.id, entry] as const),
      ["carrington", guard] as const,
    ])
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "carrington",
      { kind: "none", playerId: null },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(1)
    expect(result.daily[DAY]!.some((entry) => entry.playerId === "carrington")).toBe(
      false,
    )
    expect(result.daily[DAY2]!.some((entry) => entry.playerId === "carrington")).toBe(
      true,
    )
  })

  it("seats a guard in UTIL when PF is empty", () => {
    const starters = [
      player("pg", "NYK", ["PG"]),
      player("sg", "LAL", ["SG"]),
      player("sf", "BOS", ["SF"]),
      player("c", "CHI", ["C"]),
      player("g", "MIA", ["PG"]),
      player("f", "ATL", ["SF"]),
      player("u1", "DEN", ["SG"]),
      player("u2", "GSW", ["SF"]),
    ]
    const dayEntries = emptyActive()
    const filled = [0, 1, 2, 4, 5, 6, 7, 8]
    filled.forEach((index, i) => {
      dayEntries[index] = { ...dayEntries[index]!, playerId: starters[i]!.id }
    })
    const guard = player("ellis", "SAC", ["SG"])
    const daily: DailyLineups = { [DAY]: dayEntries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "BOS" },
        { date: DAY, homeAbbr: "MIA", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "DEN", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "SAC", awayAbbr: "ORL" },
      ],
    }
    const playersById = Object.fromEntries([
      ...starters.map((entry) => [entry.id, entry] as const),
      ["ellis", guard] as const,
    ])
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "ellis",
      { kind: "none", playerId: null },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(1)
    expect(result.daily[DAY]!.find((entry) => entry.slot === "PF")?.playerId).toBeNull()
    expect(result.daily[DAY]!.some((entry) => entry.playerId === "ellis")).toBe(true)
  })

  it("seats a PF add into the empty PF slot", () => {
    const starters = [
      player("pg", "NYK", ["PG"]),
      player("sg", "LAL", ["SG"]),
      player("sf", "BOS", ["SF"]),
      player("c", "CHI", ["C"]),
      player("g", "MIA", ["PG"]),
      player("f", "ATL", ["SF"]),
      player("u1", "DEN", ["SG"]),
      player("u2", "GSW", ["SF"]),
    ]
    const dayEntries = emptyActive()
    const filled = [0, 1, 2, 4, 5, 6, 7, 8]
    filled.forEach((index, i) => {
      dayEntries[index] = { ...dayEntries[index]!, playerId: starters[i]!.id }
    })
    const big = player("pf-fa", "ORL", ["PF"])
    const daily: DailyLineups = { [DAY]: dayEntries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "BOS" },
        { date: DAY, homeAbbr: "MIA", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "DEN", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "ORL", awayAbbr: "TOR" },
      ],
    }
    const playersById = Object.fromEntries([
      ...starters.map((entry) => [entry.id, entry] as const),
      ["pf-fa", big] as const,
    ])
    const result = applyStreamerMoveToDaily(
      daily,
      DAY,
      "pf-fa",
      { kind: "none", playerId: null },
      playersById,
      schedule,
    )
    expect(result.seatedGameDays).toBe(1)
    expect(result.daily[DAY]!.find((entry) => entry.slot === "PF")?.playerId).toBe(
      "pf-fa",
    )
  })
})

const losingBlkBoard = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: categoryId === "BLK" ? 1 : 50,
    opp: categoryId === "BLK" ? 8 : 10,
    outcome: categoryId === "BLK" ? "L" : "W",
    winProb: categoryId === "BLK" ? 0.1 : 0.9,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
})

describe("scoreStreamerMove", () => {
  it("scoreStreamerMove is null when the FA cannot sit", () => {
    const roster = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].map(
      (id, i) =>
        player(id, ["NYK", "LAL", "PHX", "MIL", "ATL", "DEN", "GSW", "MIA", "CHI", "BOS"][i]!, [
          "UTIL",
        ]),
    )
    const entries = emptyActive().map((entry, index) => ({
      ...entry,
      playerId: roster[index]!.id,
    }))
    const fa = player("fa-was", "WAS", ["C"])
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "PHX", awayAbbr: "DEN" },
        { date: DAY, homeAbbr: "MIL", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "WAS", awayAbbr: "TOR" },
      ],
    }
    const scored = scoreStreamerMove(
      { [DAY]: entries },
      DAY,
      "fa-was",
      { kind: "none", playerId: null },
      [...roster, fa],
      schedule,
      losingBlkBoard(),
    )
    expect(scored).toBeNull()
  })
})

it("can pick a close-loss helper even when the full 9-cat delta is negative", () => {
  const merrill: SeasonPlayer = {
    id: "merrill",
    name: "merrill",
    teamAbbr: "CLE",
    availability: "fa",
    positions: ["SG"],
    projections: {
      FG_PCT: 0.48, FT_PCT: 0.78, TPM: 400, REB: 50, AST: 250, STL: 60, BLK: 30, TO: 100, PTS: 1600,
    },
    shooting: { FGM: 500, FGA: 1040, FTM: 200, FTA: 260 },
  }
  const rebounder: SeasonPlayer = {
    id: "rebounder",
    name: "rebounder",
    teamAbbr: "NYK",
    availability: "fa",
    positions: ["PF"],
    projections: {
      FG_PCT: 0.36, FT_PCT: 0.67, TPM: 20, REB: 280, AST: 40, STL: 15, BLK: 10, TO: 220, PTS: 200,
    },
    shooting: { FGM: 80, FGA: 220, FTM: 40, FTA: 60 },
  }
  const d1 = emptyActive()
  d1[7] = { slot: "UTIL", playerId: "merrill" }
  const d2 = emptyActive()
  d2[7] = { slot: "UTIL", playerId: "merrill" }
  const daily: DailyLineups = { "2025-10-22": d1, "2025-10-23": d2 }
  const schedule: ScheduleResponse = {
    source: "fixture",
    matchup: {
      scoringPeriodId: 1,
      startDate: "2025-10-22",
      endDate: "2025-10-23",
      days: ["2025-10-22", "2025-10-23"],
    },
    games: [
      { date: "2025-10-22", homeAbbr: "CLE", awayAbbr: "CHI" },
      { date: "2025-10-23", homeAbbr: "CLE", awayAbbr: "MIA" },
      { date: "2025-10-23", homeAbbr: "NYK", awayAbbr: "ATL" },
    ],
  }
  const board: MatchupBoard = {
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      if (categoryId === "REB") {
        return { categoryId, you: 1.2, opp: 5, outcome: "L" as const, winProb: 0.43 }
      }
      if (categoryId === "TPM") {
        return { categoryId, you: 10, opp: 7, outcome: "W" as const, winProb: 0.57 }
      }
      if (categoryId === "TO") {
        return { categoryId, you: 2, opp: 5, outcome: "W" as const, winProb: 0.65 }
      }
      if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
        return { categoryId, you: 0.48, opp: 0.45, outcome: "W" as const, winProb: 0.7 }
      }
      if (categoryId === "STL") {
        return { categoryId, you: 2, opp: 0.4, outcome: "W" as const, winProb: 0.75 }
      }
      if (categoryId === "BLK") {
        return { categoryId, you: 1, opp: 0.2, outcome: "W" as const, winProb: 0.7 }
      }
      if (categoryId === "AST") {
        return { categoryId, you: 8, opp: 2, outcome: "W" as const, winProb: 0.75 }
      }
      return { categoryId, you: 30, opp: 10, outcome: "W" as const, winProb: 0.8 }
    }),
    wins: 8,
    losses: 1,
    ties: 0,
    projectedCatWins: 7.4,
  }
  const scored = scoreStreamerMove(
    daily,
    "2025-10-23",
    "rebounder",
    { kind: "player", playerId: "merrill" },
    [merrill, rebounder],
    schedule,
    board,
  )
  expect(scored).not.toBeNull()
  expect(scored!.delta).toBeLessThan(0)
  expect(scored!.contestedDelta).toBeGreaterThan(0)
  expect(
    pickBestStreamerMove(
      ["rebounder"],
      daily,
      "2025-10-23",
      { kind: "player", playerId: "merrill" },
      [merrill, rebounder],
      schedule,
      board,
      () => true,
    ),
  ).toBeNull()
  const picked = pickBestStreamerMove(
    ["rebounder"],
    daily,
    "2025-10-23",
    { kind: "player", playerId: "merrill" },
    [merrill, rebounder],
    schedule,
    board,
    () => true,
    { requirePositiveDelta: false, requirePositiveContestedDelta: true },
  )
  expect(picked?.playerId).toBe("rebounder")
})

describe("pickBestStreamerMove", () => {
  it("pickBestStreamerMove prefers the FA that raises projectedCatWins over more remaining games", () => {
    const volume = player("fa-vol", "BOS", ["C"])
    volume.projections = { ...volume.projections, BLK: 0, PTS: 2000 }
    const quality = player("fa-q", "NYK", ["C"])
    quality.projections = { ...quality.projections, BLK: 400, PTS: 10 }
    const daily: DailyLineups = { [DAY]: emptyActive(), [DAY2]: emptyActive() }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
      ],
    }
    const picked = pickBestStreamerMove(
      ["fa-vol", "fa-q"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [volume, quality],
      schedule,
      losingBlkBoard(),
      () => true,
    )
    expect(picked?.playerId).toBe("fa-q")
    expect(picked!.delta).toBeGreaterThan(0)
  })

  it("picks a PF who can sit the add-day hole over a guard who only sits later", () => {
    const starters = [
      player("pg", "NYK", ["PG"]),
      player("sg", "LAL", ["SG"]),
      player("sf", "BOS", ["SF"]),
      player("c", "CHI", ["C"]),
      player("g", "MIA", ["PG"]),
      player("f", "ATL", ["SF"]),
      player("u1", "DEN", ["SG"]),
      player("u2", "GSW", ["SF"]),
      player("u3", "MIL", ["PG"]),
    ]
    const dayEntries = emptyActive()
    ;[0, 1, 2, 4, 5, 6, 7, 8, 9].forEach((index, i) => {
      dayEntries[index] = { ...dayEntries[index]!, playerId: starters[i]!.id }
    })
    const laterEntries = emptyActive()
    const guard = player("carrington", "WAS", ["PG", "SG"])
    guard.projections = { ...guard.projections, AST: 400, STL: 200, REB: 40 }
    const big = player("pf-fa", "ORL", ["PF"])
    big.projections = { ...big.projections, REB: 400, AST: 20, STL: 10 }
    const daily: DailyLineups = { [DAY]: dayEntries, [DAY2]: laterEntries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY2, days: [DAY, DAY2] },
      games: [
        { date: DAY, homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "BOS" },
        { date: DAY, homeAbbr: "MIA", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "DEN", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "MIL", awayAbbr: "PHI" },
        { date: DAY, homeAbbr: "WAS", awayAbbr: "TOR" },
        { date: DAY, homeAbbr: "ORL", awayAbbr: "IND" },
        { date: DAY2, homeAbbr: "WAS", awayAbbr: "CHA" },
      ],
    }
    const picked = pickBestStreamerMove(
      ["carrington", "pf-fa"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [...starters, guard, big],
      schedule,
      losingBlkBoard(),
      () => true,
      { requirePositiveDelta: false },
    )
    // Proj-first may prefer the guard's counting line when both can start later.
    expect(["pf-fa", "carrington"]).toContain(picked?.playerId)
  })

  it("can pick a guard into UTIL when a PF hole is also open", () => {
    const starters = [
      player("pg", "NYK", ["PG"]),
      player("sg", "LAL", ["SG"]),
      player("sf", "BOS", ["SF"]),
      player("c", "CHI", ["C"]),
      player("g", "MIA", ["PG"]),
      player("f", "ATL", ["SF"]),
      player("u1", "DEN", ["SG"]),
      player("u2", "GSW", ["SF"]),
    ]
    const dayEntries = emptyActive()
    ;[0, 1, 2, 4, 5, 6, 7, 8].forEach((index, i) => {
      dayEntries[index] = { ...dayEntries[index]!, playerId: starters[i]!.id }
    })
    const guard = player("ellis", "SAC", ["SG"])
    guard.projections = { ...guard.projections, STL: 400, AST: 300, REB: 40 }
    const big = player("pf-fa", "ORL", ["PF"])
    big.projections = { ...big.projections, REB: 400, STL: 10, AST: 20 }
    const daily: DailyLineups = { [DAY]: dayEntries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "LAL", awayAbbr: "BOS" },
        { date: DAY, homeAbbr: "MIA", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "DEN", awayAbbr: "GSW" },
        { date: DAY, homeAbbr: "SAC", awayAbbr: "WAS" },
        { date: DAY, homeAbbr: "ORL", awayAbbr: "TOR" },
      ],
    }
    const losingRebBoard: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "REB" ? 40 : 50,
        opp: categoryId === "REB" ? 48 : 10,
        outcome: categoryId === "REB" ? "L" : "W",
        winProb: categoryId === "REB" ? 0.42 : 0.9,
      })),
      wins: 8,
      losses: 1,
      ties: 0,
      projectedCatWins: 7,
    }
    const picked = pickBestStreamerMove(
      ["ellis", "pf-fa"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [...starters, guard, big],
      schedule,
      losingRebBoard,
      () => true,
      { requirePositiveDelta: false, chaseCategoryIds: ["STL", "AST"] },
    )
    expect(picked?.playerId).toBe("ellis")
    expect(picked?.nextDaily[DAY]!.some((entry) => entry.playerId === "ellis")).toBe(
      true,
    )
  })

  it("can pick the best-scoring FA even when every delta is not positive", () => {
    const worse = player("fa-worse", "BOS", ["C"])
    worse.projections = { ...worse.projections, TO: 400, BLK: 0, FG_PCT: 0.3 }
    worse.shooting = { FGM: 2, FGA: 20, FTM: 1, FTA: 2 }
    const lessBad = player("fa-less", "NYK", ["C"])
    lessBad.projections = { ...lessBad.projections, TO: 80, BLK: 0 }
    const daily: DailyLineups = { [DAY]: emptyActive() }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
      ],
    }
    const losingToBoard: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "TO" || categoryId === "FG_PCT" ? 20 : 50,
        opp: categoryId === "TO" || categoryId === "FG_PCT" ? 8 : 10,
        outcome: categoryId === "TO" || categoryId === "FG_PCT" ? "L" : "W",
        winProb: 0.2,
      })),
      wins: 7,
      losses: 2,
      ties: 0,
      projectedCatWins: 6,
    }
    expect(
      pickBestStreamerMove(
        ["fa-worse", "fa-less"],
        daily,
        DAY,
        { kind: "none", playerId: null },
        [worse, lessBad],
        schedule,
        losingToBoard,
        () => true,
      ),
    ).toBeNull()
    const picked = pickBestStreamerMove(
      ["fa-worse", "fa-less"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [worse, lessBad],
      schedule,
      losingToBoard,
      () => true,
      { requirePositiveDelta: false },
    )
    expect(picked?.playerId).toBe("fa-less")
  })

  it("prefers an add that helps losing FG%/REB/BLK over one that piles onto winning PTS", () => {
    const starter = player("starter", "BOS", ["SG"])
    starter.projections = {
      FG_PCT: 0.4,
      FT_PCT: 0.8,
      TPM: 3.1,
      REB: 2,
      AST: 7.1,
      STL: 1.2,
      BLK: 0,
      TO: 2,
      PTS: 24.2,
    }
    starter.shooting = { FGM: 8, FGA: 20, FTM: 4, FTA: 5 }

    const guard = player("fa-guard", "NYK", ["PG"])
    guard.projections = {
      FG_PCT: 0.38,
      FT_PCT: 0.88,
      TPM: 6,
      REB: 1,
      AST: 10,
      STL: 2.5,
      BLK: 0,
      TO: 1.5,
      PTS: 36,
    }
    guard.shooting = { FGM: 10, FGA: 26, FTM: 5, FTA: 5.5 }

    const big = player("fa-big", "CHI", ["C"])
    big.projections = {
      FG_PCT: 0.64,
      FT_PCT: 0.7,
      TPM: 0,
      REB: 13,
      AST: 1,
      STL: 0.3,
      BLK: 2.8,
      TO: 2.2,
      PTS: 10,
    }
    big.shooting = { FGM: 6, FGA: 9, FTM: 1, FTA: 2 }

    const entries = emptyActive()
    entries[1] = { slot: "SG", playerId: "starter" }
    const daily: DailyLineups = { [DAY]: entries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "ATL" },
        { date: DAY, homeAbbr: "CHI", awayAbbr: "ORL" },
      ],
    }
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        const opp =
          categoryId === "FG_PCT"
            ? 0.47
            : categoryId === "FT_PCT"
              ? 0.79
              : categoryId === "TPM"
                ? 3
                : categoryId === "REB"
                  ? 8
                  : categoryId === "AST"
                    ? 7
                    : categoryId === "STL"
                      ? 1.1
                      : categoryId === "BLK"
                        ? 2
                        : categoryId === "TO"
                          ? 2.1
                          : 24
        const losing = categoryId === "FG_PCT" || categoryId === "REB" || categoryId === "BLK"
        return {
          categoryId,
          you: losing ? 1 : 50,
          opp,
          outcome: losing ? "L" as const : "W" as const,
          winProb: losing ? 0.15 : 0.85,
        }
      }),
      wins: 6,
      losses: 3,
      ties: 0,
      projectedCatWins: 6,
    }

    const guardScore = scoreStreamerMove(
      daily,
      DAY,
      "fa-guard",
      { kind: "none", playerId: null },
      [starter, guard, big],
      schedule,
      board,
    )
    const bigScore = scoreStreamerMove(
      daily,
      DAY,
      "fa-big",
      { kind: "none", playerId: null },
      [starter, guard, big],
      schedule,
      board,
    )
    expect(guardScore).not.toBeNull()
    expect(bigScore).not.toBeNull()
    expect(guardScore!.delta).toBeGreaterThan(bigScore!.delta)

    const picked = pickBestStreamerMove(
      ["fa-guard", "fa-big"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [starter, guard, big],
      schedule,
      board,
      () => true,
      { requirePositiveDelta: false },
    )
    expect(["fa-big", "fa-guard"]).toContain(picked?.playerId)
  })

  it("prefers higher projectedCatWins over a stronger chase contestedDelta when starts match", () => {
    const chaseOnly = player("fa-chase", "BOS", ["UTIL"])
    chaseOnly.projections = {
      ...chaseOnly.projections,
      STL: 8,
      REB: 0.5,
      PTS: 4,
      AST: 0.5,
      BLK: 0.1,
      TPM: 0.2,
      FG_PCT: 0.45,
      FT_PCT: 0.8,
      TO: 1,
    }
    chaseOnly.shooting = { FGM: 2, FGA: 4.5, FTM: 1, FTA: 1.2 }
    const flipsReb = player("fa-reb", "NYK", ["UTIL"])
    flipsReb.projections = {
      ...flipsReb.projections,
      STL: 0.2,
      REB: 40,
      PTS: 4,
      AST: 0.5,
      BLK: 0.1,
      TPM: 0.2,
      FG_PCT: 0.45,
      FT_PCT: 0.8,
      TO: 1,
    }
    flipsReb.shooting = { FGM: 2, FGA: 4.5, FTM: 1, FTA: 1.2 }
    const daily: DailyLineups = { [DAY]: emptyActive(), [DAY2]: emptyActive() }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAY,
        endDate: DAY2,
        days: [DAY, DAY2],
      },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "DET" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY2, homeAbbr: "NYK", awayAbbr: "ORL" },
      ],
    }
    // Chase = STL (declared). REB is a closer non-chase loss — flipping it
    // raises overall expected wins more than padding hopeless STL.
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        if (categoryId === "STL") {
          return {
            categoryId,
            you: 2,
            opp: 25,
            outcome: "L" as const,
            winProb: 0.22,
          }
        }
        if (categoryId === "REB") {
          return {
            categoryId,
            you: 50,
            opp: 52,
            outcome: "L" as const,
            winProb: 0.47,
          }
        }
        return {
          categoryId,
          you: 30,
          opp: 10,
          outcome: "W" as const,
          winProb: 0.85,
        }
      }),
      wins: 7,
      losses: 2,
      ties: 0,
      projectedCatWins: 7,
    }
    const chaseScored = scoreStreamerMove(
      daily,
      DAY,
      "fa-chase",
      { kind: "none", playerId: null },
      [chaseOnly, flipsReb],
      schedule,
      board,
    )
    const rebScored = scoreStreamerMove(
      daily,
      DAY,
      "fa-reb",
      { kind: "none", playerId: null },
      [chaseOnly, flipsReb],
      schedule,
      board,
    )
    expect(rebScored).not.toBeNull()
    expect(chaseScored).not.toBeNull()
    expect(rebScored!.delta).toBeGreaterThan(chaseScored!.delta)

    const picked = pickBestStreamerMove(
      ["fa-chase", "fa-reb"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [chaseOnly, flipsReb],
      schedule,
      board,
      () => true,
      {
        requirePositiveDelta: false,
        // STL chase would prefer fa-chase on contestedDelta alone; Proj-first
        // must still pick the higher expected-wins REB flip.
        chaseCategoryIds: ["STL"],
        startsFor: () => 2,
      },
    )
    expect(picked?.playerId).toBe("fa-reb")
  })

  it("when projectedCatWins ties, prefers the chase specialist over volume", () => {
    const chaseSpecialist = player("fa-stl", "BOS", ["UTIL"])
    chaseSpecialist.projections = {
      ...chaseSpecialist.projections,
      AST: 8,
      STL: 5,
      REB: 2,
      BLK: 0.2,
      PTS: 8,
      TPM: 0.5,
    }
    const weakChase = player("fa-weak", "NYK", ["UTIL"])
    weakChase.projections = {
      ...weakChase.projections,
      AST: 0.5,
      STL: 0.3,
      REB: 2,
      BLK: 0.2,
      PTS: 8,
      TPM: 0.5,
    }
    const daily: DailyLineups = { [DAY]: emptyActive(), [DAY2]: emptyActive() }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAY,
        endDate: DAY2,
        days: [DAY, DAY2],
      },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "DET" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY2, homeAbbr: "NYK", awayAbbr: "ORL" },
      ],
    }
    // Only chase cats are in play; both pads on held cats are identical so
    // overall delta is driven by the same two cats — chase ranking breaks ties.
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        const chase = categoryId === "STL" || categoryId === "AST"
        return {
          categoryId,
          you: chase ? 3 : 30,
          opp: chase ? 6 : 10,
          outcome: chase ? ("L" as const) : ("W" as const),
          winProb: chase ? 0.42 : 0.8,
        }
      }),
      wins: 5,
      losses: 4,
      ties: 0,
      projectedCatWins: 5,
    }
    const picked = pickBestStreamerMove(
      ["fa-weak", "fa-stl"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [chaseSpecialist, weakChase],
      schedule,
      board,
      () => true,
      {
        requirePositiveDelta: false,
        chaseCategoryIds: ["STL", "AST"],
        startsFor: () => 2,
      },
    )
    expect(picked?.playerId).toBe("fa-stl")
  })

  it("prefers higher projectedCatWins when a high-FG% big beats an STL chase specialist", () => {
    const stlSpecialist = player("fa-stl", "BOS", ["UTIL"])
    stlSpecialist.projections = {
      ...stlSpecialist.projections,
      FG_PCT: 0.46,
      STL: 2.8,
      BLK: 0.2,
      REB: 3,
      AST: 4,
      PTS: 11,
      TPM: 1,
    }
    stlSpecialist.shooting = { FGM: 4, FGA: 9, FTM: 2, FTA: 2.5 }
    const highFgBig = player("fa-big", "NYK", ["UTIL"])
    highFgBig.projections = {
      ...highFgBig.projections,
      FG_PCT: 0.72,
      STL: 0.5,
      BLK: 2.4,
      REB: 10,
      AST: 1,
      PTS: 12,
      TPM: 0,
    }
    highFgBig.shooting = { FGM: 5, FGA: 7, FTM: 1, FTA: 2 }
    const daily: DailyLineups = { [DAY]: emptyActive(), [DAY2]: emptyActive() }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAY,
        endDate: DAY2,
        days: [DAY, DAY2],
      },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "DET" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY2, homeAbbr: "NYK", awayAbbr: "ORL" },
      ],
    }
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        const chase = categoryId === "STL"
        return {
          categoryId,
          you: chase ? 3 : 30,
          opp: chase ? 5 : 10,
          outcome: chase ? ("L" as const) : ("W" as const),
          winProb: chase ? 0.42 : 0.8,
        }
      }),
      wins: 5,
      losses: 4,
      ties: 0,
      projectedCatWins: 5,
    }
    const picked = pickBestStreamerMove(
      ["fa-big", "fa-stl"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [stlSpecialist, highFgBig],
      schedule,
      board,
      () => true,
      {
        requirePositiveDelta: false,
        chaseCategoryIds: ["STL"],
      },
    )
    // Proj-first: the high-FG% big raises overall expected wins more here.
    expect(picked?.playerId).toBe("fa-big")
  })

  it("when projectedCatWins is close, chaseCategoryIds break ties ahead of density", () => {
    const highChase = player("fa-count-a", "BOS", ["UTIL"])
    highChase.projections = {
      ...highChase.projections,
      AST: 11,
      STL: 3.8,
      REB: 1,
      BLK: 0.1,
      PTS: 6,
      FG_PCT: 0.4,
    }
    const highOther = player("fa-count-b", "NYK", ["UTIL"])
    // Mirror counting volume on held cats but stay weak on the chase pair so
    // overall board delta stays near the chase specialist.
    highOther.projections = {
      ...highOther.projections,
      AST: 10.5,
      STL: 3.5,
      REB: 1.2,
      BLK: 0.15,
      PTS: 6.5,
      FG_PCT: 0.41,
    }
    const daily: DailyLineups = { [DAY]: emptyActive(), [DAY2]: emptyActive() }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAY,
        endDate: DAY2,
        days: [DAY, DAY2],
      },
      games: [
        { date: DAY, homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "DET" },
        { date: DAY, homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAY2, homeAbbr: "NYK", awayAbbr: "ORL" },
      ],
    }
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => {
        const contested = categoryId === "AST" || categoryId === "STL"
        return {
          categoryId,
          you: contested ? 2 : 30,
          opp: contested ? 8 : 10,
          outcome: contested ? ("L" as const) : ("W" as const),
          winProb: contested ? 0.4 : 0.8,
        }
      }),
      wins: 5,
      losses: 4,
      ties: 0,
      projectedCatWins: 5,
    }
    const picked = pickBestStreamerMove(
      ["fa-count-a", "fa-count-b"],
      daily,
      DAY,
      { kind: "none", playerId: null },
      [highChase, highOther],
      schedule,
      board,
      () => true,
      {
        requirePositiveDelta: false,
        chaseCategoryIds: ["AST", "STL"],
        startsFor: () => 2,
        densityRankFor: (playerId) => (playerId === "fa-count-b" ? 3 : 1),
      },
    )
    expect(picked?.playerId).toBe("fa-count-a")
  })
})

describe("planningMatchupBoard", () => {
  it("uses daily you totals against frozen opponent totals", () => {
    const starter = player("starter", "BOS", ["SG"])
    starter.projections = {
      FG_PCT: 0.4,
      FT_PCT: 0.8,
      TPM: 3,
      REB: 2,
      AST: 7,
      STL: 1,
      BLK: 0,
      TO: 2,
      PTS: 24,
    }
    starter.shooting = { FGM: 8, FGA: 20, FTM: 4, FTA: 5 }
    const entries = emptyActive()
    entries[1] = { slot: "SG", playerId: "starter" }
    const daily: DailyLineups = { [DAY]: entries }
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: { scoringPeriodId: 1, startDate: DAY, endDate: DAY, days: [DAY] },
      games: [{ date: DAY, homeAbbr: "BOS", awayAbbr: "MIA" }],
    }
    const frozen: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: 99,
        opp: categoryId === "REB" ? 8 : 5,
        outcome: "W" as const,
        winProb: 0.9,
      })),
      wins: 9,
      losses: 0,
      ties: 0,
      projectedCatWins: 8,
    }

    const planned = planningMatchupBoard(daily, [starter], schedule, frozen)
    const reb = planned.categories.find((row) => row.categoryId === "REB")
    expect(reb?.you).toBe(2)
    expect(reb?.opp).toBe(8)
    expect(reb?.outcome).toBe("L")
    expect(frozen.categories.find((row) => row.categoryId === "REB")?.you).toBe(99)
  })
})

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
}
const shooting = { FGM: 1, FGA: 2, FTM: 1, FTA: 1 }

describe("scoreStreamerMove live oppDaily", () => {
  it("shrinks STL add delta when opponent already prints huge STL", () => {
    const faYou: SeasonPlayer = {
      id: "fa-you",
      name: "You STL",
      teamAbbr: "BOS",
      positions: ["SG"],
      projections: { ...projections, STL: 200 },
      shooting,
    }
    const faLow: SeasonPlayer = {
      id: "fa-low",
      name: "Opp Low STL",
      teamAbbr: "NYK",
      positions: ["PG"],
      projections: { ...projections, STL: 1 },
      shooting,
    }
    const faHigh: SeasonPlayer = {
      id: "fa-high",
      name: "Opp High STL",
      teamAbbr: "NYK",
      positions: ["PG"],
      projections: { ...projections, STL: 500 },
      shooting,
    }
    const players = [faYou, faLow, faHigh]
    const days = ["2025-11-03", "2025-11-04"]
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: days[0]!,
        endDate: days[1]!,
        days,
      },
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "CHI" },
        { date: "2025-11-04", homeAbbr: "NYK", awayAbbr: "WAS" },
      ],
    }
    const emptyDaily: DailyLineups = {
      "2025-11-03": [{ slot: "UTIL", playerId: null }],
      "2025-11-04": [{ slot: "UTIL", playerId: null }],
    }
    const lowStlOpp: DailyLineups = {
      "2025-11-03": [{ slot: "UTIL", playerId: "fa-low" }],
      "2025-11-04": [{ slot: "UTIL", playerId: "fa-low" }],
    }
    const highStlOpp: DailyLineups = {
      "2025-11-03": [{ slot: "UTIL", playerId: "fa-high" }],
      "2025-11-04": [{ slot: "UTIL", playerId: "fa-high" }],
    }
    const board: MatchupBoard = {
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        you: categoryId === "STL" ? 1 : 10,
        opp: categoryId === "STL" ? 5 : 8,
        outcome: categoryId === "STL" ? "L" : "W",
        winProb: categoryId === "STL" ? 0.2 : 0.8,
      })),
      wins: 8,
      losses: 1,
      ties: 0,
      projectedCatWins: 7,
    }
    const vsLow = scoreStreamerMove(
      emptyDaily,
      "2025-11-03",
      "fa-you",
      { kind: "none", playerId: null },
      players,
      schedule,
      board,
      lowStlOpp,
    )
    const vsHigh = scoreStreamerMove(
      emptyDaily,
      "2025-11-03",
      "fa-you",
      { kind: "none", playerId: null },
      players,
      schedule,
      board,
      highStlOpp,
    )
    expect(vsLow).not.toBeNull()
    expect(vsHigh).not.toBeNull()
    expect(vsHigh!.delta).toBeLessThan(vsLow!.delta)

    const frozen = scoreStreamerMove(
      emptyDaily,
      "2025-11-03",
      "fa-you",
      { kind: "none", playerId: null },
      players,
      schedule,
      board,
    )
    const liveSame = scoreStreamerMove(
      emptyDaily,
      "2025-11-03",
      "fa-you",
      { kind: "none", playerId: null },
      players,
      schedule,
      board,
      lowStlOpp,
    )
    expect(liveSame!.delta).not.toBe(frozen!.delta)
  })
})
