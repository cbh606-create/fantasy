import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import {
  applyStreamerMoveToDaily,
  pickBestStreamerMove,
  scoreStreamerMove,
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
        { date: DAY2, homeAbbr: "BOS", awayAbbr: "MIA" },
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
})
