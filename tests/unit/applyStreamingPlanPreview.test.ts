import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { applyStreamingPlanPreview } from "@/lib/matchup/applyStreamingPlanPreview"
import { youTotalsFromDaily, type DailyLineups } from "@/lib/matchup/dailyLineups"
import { buildStreamingPlan } from "@/lib/matchup/streamingPlans"
import type {
  MatchupBoard,
  StreamingPlan,
  StreamingPlanDayCell,
} from "@/lib/matchup/types"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

const DAYS = ["2025-11-03", "2025-11-04", "2025-11-05"] as const

const emptyActiveEntries = (): SeasonRosterEntry[] => [
  { slot: "PG", playerId: null },
  { slot: "SG", playerId: null },
  { slot: "SF", playerId: null },
  { slot: "PF", playerId: null },
  { slot: "C", playerId: null },
  { slot: "G", playerId: null },
  { slot: "F", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "UTIL", playerId: null },
  { slot: "UTIL", playerId: null },
]

const withStarter = (playerId: string): SeasonRosterEntry[] => {
  const entries = emptyActiveEntries()
  entries[0] = { ...entries[0]!, playerId }
  return entries
}

const player = (
  id: string,
  teamAbbr: string,
  overrides: Partial<SeasonPlayer> = {},
): SeasonPlayer => {
  const { projections, shooting, ...rest } = overrides
  return {
    id,
    name: id,
    teamAbbr,
    positions: ["PF", "C"],
    projections: {
      FG_PCT: 0.5,
      FT_PCT: 0.8,
      TPM: 1,
      REB: 5,
      AST: 2,
      STL: 1,
      BLK: 1,
      TO: 2,
      PTS: 10,
      ...projections,
    },
    shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2.5, ...shooting },
    ...rest,
  }
}

const emptyCell = (spotIndex: number): StreamingPlanDayCell => ({
  spotIndex,
  playerId: null,
  action: "empty",
  droppedPlayerId: null,
  rosterDropPlayerId: null,
  rosterDropKind: "none",
  addIndex: null,
  alternativePlayerIds: [],
  targetCategoryIds: [],
})

const plan = (
  spotCount: 1 | 2 | 3,
  days: StreamingPlan["days"],
): StreamingPlan => ({
  spotCount,
  addLimit: 7,
  addsUsed: 1,
  gameStarts: 1,
  strategyMode: "balanced",
  suggestedStrategyMode: "balanced",
  summaryReasons: [],
  days,
})

const playerIdsOn = (daily: DailyLineups, day: string): string[] =>
  (daily[day] ?? [])
    .map((entry) => entry.playerId)
    .filter((playerId): playerId is string => playerId !== null)

describe("applyStreamingPlanPreview", () => {
  it("clears a roster drop from the add-day onward and seats the streamer on game days only", () => {
    const jjj = player("jjj", "MEM", { projections: { STL: 1, PTS: 8 } })
    const streamer = player("fa-stl", "BOS", {
      projections: { STL: 5, PTS: 20 },
    })
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[2],
        days: [...DAYS],
      },
      games: [
        { date: DAYS[0], homeAbbr: "MEM", awayAbbr: "NYK" },
        { date: DAYS[1], homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAYS[2], homeAbbr: "MEM", awayAbbr: "MIA" },
      ],
    }
    const baseDaily: DailyLineups = {
      [DAYS[0]]: withStarter("jjj"),
      [DAYS[1]]: withStarter("jjj"),
      [DAYS[2]]: withStarter("jjj"),
    }
    const previewPlan = plan(1, [
      {
        date: DAYS[0],
        cells: [emptyCell(0)],
      },
      {
        date: DAYS[1],
        cells: [
          {
            spotIndex: 0,
            playerId: "fa-stl",
            action: "add",
            droppedPlayerId: null,
            rosterDropPlayerId: "jjj",
            rosterDropKind: "player",
            addIndex: 1,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
        ],
      },
      {
        date: DAYS[2],
        cells: [
          {
            spotIndex: 0,
            playerId: "fa-stl",
            action: "hold",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "none",
            addIndex: null,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
        ],
      },
    ])
    const playersById = { jjj, "fa-stl": streamer }

    const preview = applyStreamingPlanPreview(
      baseDaily,
      previewPlan,
      playersById,
      schedule,
    )

    expect(playerIdsOn(preview, DAYS[0])).toEqual(["jjj"])
    expect(playerIdsOn(preview, DAYS[1])).toEqual(["fa-stl"])
    expect(playerIdsOn(preview, DAYS[1])).not.toContain("jjj")
    expect(playerIdsOn(preview, DAYS[2])).not.toContain("jjj")
    expect(playerIdsOn(preview, DAYS[2])).not.toContain("fa-stl")
    expect(preview[DAYS[0]]).toHaveLength(10)
    expect(preview[DAYS[1]]).toHaveLength(10)

    const players = [jjj, streamer]
    const baseStl = youTotalsFromDaily(baseDaily, players, schedule).STL
    const previewStl = youTotalsFromDaily(preview, players, schedule).STL
    expect(previewStl).toBeGreaterThan(baseStl)
  })

  it("does not seat a streamer on an off night", () => {
    const streamer = player("fa-off", "BOS")
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[1],
        days: [DAYS[0], DAYS[1]],
      },
      games: [{ date: DAYS[0], homeAbbr: "BOS", awayAbbr: "CHI" }],
    }
    const baseDaily: DailyLineups = {
      [DAYS[0]]: emptyActiveEntries(),
      [DAYS[1]]: emptyActiveEntries(),
    }
    const previewPlan = plan(1, [
      {
        date: DAYS[0],
        cells: [
          {
            spotIndex: 0,
            playerId: "fa-off",
            action: "add",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "open_slot",
            addIndex: 1,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
        ],
      },
      {
        date: DAYS[1],
        cells: [
          {
            spotIndex: 0,
            playerId: "fa-off",
            action: "hold",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "none",
            addIndex: null,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
        ],
      },
    ])

    const preview = applyStreamingPlanPreview(
      baseDaily,
      previewPlan,
      { "fa-off": streamer },
      schedule,
    )

    expect(playerIdsOn(preview, DAYS[0])).toEqual(["fa-off"])
    expect(playerIdsOn(preview, DAYS[1])).toEqual([])
  })

  it("seats two different free agents on the same day in a multi-spot plan", () => {
    const faA = player("fa-a", "BOS", { positions: ["PG"] })
    const faB = player("fa-b", "NYK", { positions: ["SG"] })
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[0],
        days: [DAYS[0]],
      },
      games: [
        { date: DAYS[0], homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAYS[0], homeAbbr: "NYK", awayAbbr: "MIA" },
      ],
    }
    const baseDaily: DailyLineups = {
      [DAYS[0]]: emptyActiveEntries(),
    }
    const previewPlan = plan(2, [
      {
        date: DAYS[0],
        cells: [
          {
            spotIndex: 0,
            playerId: "fa-a",
            action: "add",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "open_slot",
            addIndex: 1,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
          {
            spotIndex: 1,
            playerId: "fa-b",
            action: "add",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "open_slot",
            addIndex: 2,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
        ],
      },
    ])

    const preview = applyStreamingPlanPreview(
      baseDaily,
      previewPlan,
      new Map([
        ["fa-a", faA],
        ["fa-b", faB],
      ]),
      schedule,
    )

    expect(playerIdsOn(preview, DAYS[0]).sort()).toEqual(["fa-a", "fa-b"])
  })

  it("does not mutate the base daily lineups", () => {
    const jjj = player("jjj", "MEM")
    const streamer = player("fa-stl", "BOS")
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[1],
        days: [DAYS[0], DAYS[1]],
      },
      games: [
        { date: DAYS[0], homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAYS[1], homeAbbr: "MEM", awayAbbr: "NYK" },
      ],
    }
    const day0 = withStarter("jjj")
    const day1 = withStarter("jjj")
    const baseDaily: DailyLineups = {
      [DAYS[0]]: day0,
      [DAYS[1]]: day1,
    }
    const snapshot = structuredClone(baseDaily)
    const previewPlan = plan(1, [
      {
        date: DAYS[0],
        cells: [
          {
            spotIndex: 0,
            playerId: "fa-stl",
            action: "add",
            droppedPlayerId: null,
            rosterDropPlayerId: "jjj",
            rosterDropKind: "player",
            addIndex: 1,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          },
        ],
      },
    ])

    const preview = applyStreamingPlanPreview(
      baseDaily,
      previewPlan,
      { jjj, "fa-stl": streamer },
      schedule,
    )

    expect(preview).not.toBe(baseDaily)
    expect(preview[DAYS[0]]).not.toBe(day0)
    expect(baseDaily).toEqual(snapshot)
    expect(day0[0]?.playerId).toBe("jjj")
  })

  it("does not displace a game-day starter on a full night when roster drop is none", () => {
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[0],
        days: [DAYS[0]],
      },
      games: [
        { date: DAYS[0], homeAbbr: "BOS", awayAbbr: "CHI" },
        { date: DAYS[0], homeAbbr: "NYK", awayAbbr: "MIA" },
        { date: DAYS[0], homeAbbr: "LAL", awayAbbr: "GSW" },
        { date: DAYS[0], homeAbbr: "PHX", awayAbbr: "DEN" },
        { date: DAYS[0], homeAbbr: "MIL", awayAbbr: "ATL" },
        { date: DAYS[0], homeAbbr: "WAS", awayAbbr: "TOR" },
      ],
    }
    const roster = [
      player("r0", "NYK"),
      player("r1", "LAL"),
      player("r2", "PHX"),
      player("r3", "MIL"),
      player("r4", "ATL"),
      player("r5", "DEN"),
      player("r6", "GSW"),
      player("r7", "MIA"),
      player("r8", "CHI"),
      player("r9", "BOS"),
    ]
    const entries = emptyActiveEntries().map((entry, index) => ({
      ...entry,
      playerId: roster[index]!.id,
    }))
    const fa = player("fa-was", "WAS")
    const playersById = Object.fromEntries([
      ...roster.map((p) => [p.id, p] as const),
      ["fa-was", fa] as const,
    ])

    const preview = applyStreamingPlanPreview(
      { [DAYS[0]]: entries },
      plan(1, [
        {
          date: DAYS[0],
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-was",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "none",
              addIndex: 1,
            alternativePlayerIds: [],
            targetCategoryIds: [],
            },
          ],
        },
      ]),
      playersById,
      schedule,
    )

    expect(playerIdsOn(preview, DAYS[0])).not.toContain("fa-was")
    expect(playerIdsOn(preview, DAYS[0])).toHaveLength(10)
  })

  it("omits seating when omitSeats includes the streamer day", () => {
    const streamer = player("fa-stl", "BOS")
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[0],
        days: [DAYS[0]],
      },
      games: [{ date: DAYS[0], homeAbbr: "BOS", awayAbbr: "CHI" }],
    }
    const preview = applyStreamingPlanPreview(
      { [DAYS[0]]: emptyActiveEntries() },
      plan(1, [
        {
          date: DAYS[0],
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-stl",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "open_slot",
              addIndex: 1,
            alternativePlayerIds: [],
            targetCategoryIds: [],
            },
          ],
        },
      ]),
      { "fa-stl": streamer },
      schedule,
      { omitSeats: new Set([`${DAYS[0]}:fa-stl`]) },
    )

    expect(playerIdsOn(preview, DAYS[0])).not.toContain("fa-stl")
  })

  it("seats a center streamer in C, not the first empty PG slot", () => {
    const streamer = player("fa-c", "NYK", { positions: ["C"] })
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[0],
        days: [DAYS[0]],
      },
      games: [{ date: DAYS[0], homeAbbr: "NYK", awayAbbr: "PHI" }],
    }

    const preview = applyStreamingPlanPreview(
      { [DAYS[0]]: emptyActiveEntries() },
      plan(1, [
        {
          date: DAYS[0],
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-c",
              action: "add",
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "open_slot",
              addIndex: 1,
              alternativePlayerIds: [],
            targetCategoryIds: [],
            },
          ],
        },
      ]),
      { "fa-c": streamer },
      schedule,
    )

    const seated = preview[DAYS[0]]?.find((entry) => entry.playerId === "fa-c")
    expect(seated?.slot).toBe("C")
    expect(preview[DAYS[0]]?.[0]?.playerId).not.toBe("fa-c")
  })

  it("clears a future-day roster drop when the plan is built with today set", () => {
    const you = player("you-1", "CHI")
    const streamer = player("fa-a", "BOS", {
      projections: { STL: 180, PTS: 20 },
    })
    const losingStlBoard: MatchupBoard = {
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
    const schedule: ScheduleResponse = {
      source: "fixture",
      matchup: {
        scoringPeriodId: 1,
        startDate: DAYS[0],
        endDate: DAYS[1],
        days: [DAYS[0], DAYS[1]],
      },
      games: [
        { date: DAYS[0], homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: DAYS[1], homeAbbr: "BOS", awayAbbr: "ORL" },
        { date: DAYS[1], homeAbbr: "CHI", awayAbbr: "MIA" },
      ],
    }
    const state = {
      name: "Tiny League",
      season: 2025,
      categories: ALL_CATEGORY_IDS.map((id) => ({
        id,
        enabled: true,
        weight: 1,
      })),
      perspectiveTeamIndex: 0,
      teams: [
        {
          teamIndex: 0,
          name: "You",
          entries: [{ slot: "UTIL" as const, playerId: "you-1" }],
        },
        {
          teamIndex: 1,
          name: "Them",
          entries: [{ slot: "UTIL" as const, playerId: null }],
        },
      ],
      players: [you, streamer],
      availablePlayerIds: ["fa-a"],
      waiverOrder: [0, 1],
      source: "manual" as const,
    }
    const baseDaily: DailyLineups = {
      [DAYS[0]]: withStarter("you-1"),
      [DAYS[1]]: withStarter("you-1"),
    }
    const previewPlan = buildStreamingPlan({
      spotCount: 1,
      state,
      schedule,
      board: losingStlBoard,
      strategyMode: "aggressive",
      today: DAYS[0],
      forcedRosterDrops: { [`${DAYS[0]}:0`]: "hold" },
    })

    const preview = applyStreamingPlanPreview(
      baseDaily,
      previewPlan,
      { "you-1": you, "fa-a": streamer },
      schedule,
    )

    expect(previewPlan.days[1]!.cells[0]).toMatchObject({
      action: "add",
      rosterDropKind: "player",
      rosterDropPlayerId: "you-1",
    })
    expect(playerIdsOn(preview, DAYS[0])).toContain("you-1")
    expect(playerIdsOn(preview, DAYS[1])).not.toContain("you-1")
  })
})
