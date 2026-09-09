import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import {
  applyStreamerMoveToDaily,
  pickBestStreamerMove,
  planningMatchupBoard,
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
    expect(picked?.playerId).toBe("fa-big")
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
