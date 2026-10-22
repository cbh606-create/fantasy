import { describe, expect, it } from "vitest"
import {
  clampFixedMenuBox,
  clearLaterDropsOnSameSpot,
  collectEarlierAddedStreamerIds,
  compareStreamingAddDropKeys,
  eligibleRosterDropPlayerIds,
  irParkDropOptions,
  irParkDropValue,
  isAfterStreamingAddDropKey,
  resolveStoredIrParkValue,
  retainOtherSpotMoves,
  rosterDropSelectOptions,
  rosterDropSelectPlayerIds,
} from "@/lib/matchup/streamingDropOptions"
import type { StreamingPlan, StreamingPlanDayCell } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

const player = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  teamAbbr: "BOS",
  positions: ["SG"],
  projections: {
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 2,
    REB: 5,
    AST: 4,
    STL: 1,
    BLK: 1,
    TO: 2,
    PTS: 16,
  },
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
})

describe("streamingAddDropKey ordering", () => {
  it("orders by date then spotIndex", () => {
    expect(
      compareStreamingAddDropKeys("2025-11-03:0", "2025-11-04:0"),
    ).toBeLessThan(0)
    expect(
      compareStreamingAddDropKeys("2025-11-03:0", "2025-11-03:1"),
    ).toBeLessThan(0)
    expect(isAfterStreamingAddDropKey("2025-11-04:0", "2025-11-03:1")).toBe(
      true,
    )
  })

  it("clears later drops on the edited spot and keeps the other spot", () => {
    const next = clearLaterDropsOnSameSpot(
      {
        "2025-11-03:0": "a",
        "2025-11-03:1": "b",
        "2025-11-04:0": "c",
        "2025-11-04:1": "d",
      },
      "2025-11-03:0",
    )
    expect(next).toEqual({
      "2025-11-03:0": "a",
      "2025-11-03:1": "b",
      "2025-11-04:1": "d",
    })
  })
})

const planCell = (
  spotIndex: number,
  playerId: string | null,
  action: StreamingPlanDayCell["action"],
  rosterDropPlayerId: string | null,
): StreamingPlanDayCell => ({
  spotIndex,
  playerId,
  action,
  droppedPlayerId: action === "drop_add" ? rosterDropPlayerId : null,
  rosterDropPlayerId,
  rosterDropKind: rosterDropPlayerId ? "player" : "none",
  addIndex: playerId ? 1 : null,
  alternativePlayerIds: [],
  targetCategoryIds: [],
})

describe("retainOtherSpotMoves", () => {
  it("pins the other edited spot's add and drop when this spot changes", () => {
    const plan = {
      spotCount: 2,
      days: [
        {
          date: "2025-11-03",
          cells: [
            planCell(0, "fa-a", "add", "cut-a"),
            planCell(1, null, "empty", null),
          ],
        },
        {
          date: "2025-11-04",
          cells: [
            planCell(0, "fa-a", "hold", null),
            planCell(1, null, "empty", null),
          ],
        },
      ],
    } as StreamingPlan
    const retained = retainOtherSpotMoves({
      plan,
      editedSpotIndex: 1,
      drops: { "2025-11-03:0": "cut-a" },
      locks: [],
    })
    expect(retained.drops["2025-11-03:0"]).toBe("cut-a")
    expect(retained.drops["2025-11-04:1"]).toBeUndefined()
    expect(retained.locks).toEqual([
      {
        date: "2025-11-03",
        spotIndex: 0,
        playerId: "fa-a",
        holdUntil: "2025-11-04",
      },
    ])
  })
})

describe("clampFixedMenuBox", () => {
  it("shifts a Sunday menu left so its scrollbar stays on screen", () => {
    expect(
      clampFixedMenuBox(
        { left: 1400, top: 200, bottom: 228 },
        176,
        192,
        1440,
        900,
      ),
    ).toEqual({ top: 232, left: 1256 })
  })
})

describe("rosterDropSelectOptions", () => {
  const playersById = {
    a: player("a", "Alpha"),
    b: player("b", "Beta"),
    c: player("c", "Gamma"),
  }

  it("excludes earlier dropped players from options", () => {
    const options = rosterDropSelectOptions({
      eligiblePlayerIds: ["a", "b", "c"],
      earlierDroppedIds: ["b"],
      allowOpenSlot: false,
      playersById,
    })

    expect(options.map((option) => option.value)).toEqual(["a", "c"])
  })

  it("includes open slot when allowed", () => {
    const options = rosterDropSelectOptions({
      eligiblePlayerIds: ["a"],
      earlierDroppedIds: [],
      allowOpenSlot: true,
      playersById,
    })

    expect(options).toEqual([
      { value: "open_slot", label: "Open slot" },
      { value: "a", label: "Alpha" },
    ])
  })

  it("can prepend Hold", () => {
    const options = rosterDropSelectOptions({
      eligiblePlayerIds: ["a"],
      earlierDroppedIds: [],
      allowOpenSlot: false,
      includeHold: true,
      playersById,
    })

    expect(options[0]).toEqual({ value: "hold", label: "Hold" })
  })

  it("orders Hold before Open slot", () => {
    const options = rosterDropSelectOptions({
      eligiblePlayerIds: ["a"],
      earlierDroppedIds: [],
      allowOpenSlot: true,
      includeHold: true,
      playersById,
    })

    expect(options[0]).toEqual({ value: "hold", label: "Hold" })
    expect(options[1]).toEqual({ value: "open_slot", label: "Open slot" })
  })
})

describe("eligibleRosterDropPlayerIds", () => {
  const star = player("star", "Star Player")
  const bench = player("bench", "Bench Guy")
  const playersById = { star, bench }
  const entries: SeasonRosterEntry[] = [
    { slot: "UTIL", playerId: "star" },
    { slot: "SG", playerId: "bench" },
  ]
  const adpByPlayerId = { star: 30, bench: 150 }

  it("hides ADP-60 stars from drop suggestions", () => {
    const ids = eligibleRosterDropPlayerIds(
      entries,
      playersById,
      [],
      adpByPlayerId,
    )

    expect(ids).toEqual(["bench"])
  })

  it("can include protected stars when asked", () => {
    const ids = eligibleRosterDropPlayerIds(
      entries,
      playersById,
      [],
      adpByPlayerId,
      undefined,
      { includeProtected: true },
    )

    expect(ids).toEqual(["bench", "star"])
  })

  it("omits tonight starters from auto roster-drop options", () => {
    const entries: SeasonRosterEntry[] = [
      { slot: "PG", playerId: "a" },
      { slot: "BE", playerId: "b" },
    ]
    const ids = eligibleRosterDropPlayerIds(
      entries,
      {
        a: player("a", "Alpha"),
        b: player("b", "Beta"),
      },
      [],
      undefined,
      undefined,
      { seatedTonightIds: new Set(["a"]) },
    )

    expect(ids).toEqual(["b"])
  })
})

describe("rosterDropSelectPlayerIds", () => {
  const star = player("star", "Star Player")
  const bench = player("bench", "Bench Guy")
  const streamer = player("fa-a", "Streamer A")
  const playersById = { star, bench, "fa-a": streamer }
  const entries: SeasonRosterEntry[] = [
    { slot: "UTIL", playerId: "star" },
    { slot: "SG", playerId: "bench" },
  ]

  it("includes ADP-protected and earlier stream adds for the dropdown", () => {
    const ids = rosterDropSelectPlayerIds(entries, playersById, [], ["fa-a"])
    expect(ids).toEqual(["bench", "star", "fa-a"].sort((a, b) =>
      playersById[a]!.name.localeCompare(playersById[b]!.name),
    ))
  })
})

const schedule = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-10-20",
    endDate: "2026-10-21",
    days: ["2026-10-20", "2026-10-21"],
  },
  games: [{ date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "NYK" }],
} satisfies ScheduleResponse

describe("irParkDropOptions", () => {
  it("lists a no-game active player and marks a non-OUT sitter", () => {
    const options = irParkDropOptions({
      entries: [
        { slot: "SG", playerId: "b" },
        { slot: "IL", playerId: null },
      ],
      playersById: {
        b: { ...player("b", "Beta"), teamAbbr: "NYK" },
      },
      date: "2026-10-20",
      schedule,
    })

    expect(options).toEqual([
      { value: "ir:b", label: "To IR · Beta (after OUT)" },
    ])
    expect(irParkDropValue("b")).toBe("ir:b")
  })

  it("omits the parenthetical when the sitter is already OUT", () => {
    const options = irParkDropOptions({
      entries: [
        { slot: "SG", playerId: "c" },
        { slot: "IL", playerId: null },
      ],
      playersById: {
        c: { ...player("c", "Gamma"), teamAbbr: "NYK", injuryStatus: "out" },
      },
      date: "2026-10-20",
      schedule,
    })

    expect(options).toEqual([{ value: "ir:c", label: "To IR · Gamma" }])
  })

  it("lists bench players and players with a game, and still skips empty, IL, and a filled IR slot", () => {
    const playersById = {
      a: player("a", "Alpha"),
      b: { ...player("b", "Beta"), teamAbbr: "NYK" },
      bench: { ...player("bench", "Bench"), teamAbbr: "DAL" },
      "out-bench": {
        ...player("out-bench", "Out Bench"),
        teamAbbr: "DAL",
        injuryStatus: "out" as const,
      },
      kept: { ...player("kept", "Kept"), teamAbbr: "NYK" },
    }
    expect(
      irParkDropOptions({
        entries: [
          { slot: "SG", playerId: "a" },
          { slot: "BE", playerId: "bench" },
          { slot: "BE", playerId: "out-bench" },
          { slot: "PG", playerId: null },
          { slot: "IL", playerId: null },
        ],
        playersById,
        date: "2026-10-21",
        schedule,
      }).map((option) => option.value),
    ).toEqual(["ir:a", "ir:bench", "ir:out-bench"])
    expect(
      irParkDropOptions({
        entries: [
          { slot: "BE", playerId: "bench" },
          { slot: "IL", playerId: null },
        ],
        playersById,
        date: "2026-10-20",
        schedule,
      }),
    ).toEqual([{ value: "ir:bench", label: "To IR · Bench (after OUT)" }])
    expect(
      irParkDropOptions({
        entries: [
          { slot: "SG", playerId: "b" },
          { slot: "IL", playerId: "kept" },
        ],
        playersById,
        date: "2026-10-20",
        schedule,
      }),
    ).toEqual([])
    expect(
      irParkDropOptions({
        entries: [
          { slot: "SG", playerId: "a" },
          { slot: "IL", playerId: null },
        ],
        playersById,
        date: "2026-10-21",
        schedule,
      }),
    ).toEqual([{ value: "ir:a", label: "To IR · Alpha (after OUT)" }])
  })

  it("omits To IR and IR hold when an IL slot already has a player", () => {
    const options = irParkDropOptions({
      entries: [
        { slot: "SG", playerId: "b" },
        { slot: "BE", playerId: "bench" },
        { slot: "IL", playerId: "kept" },
        { slot: "IL", playerId: null },
      ],
      playersById: {
        b: { ...player("b", "Beta"), teamAbbr: "NYK" },
        bench: { ...player("bench", "Bench"), teamAbbr: "DAL" },
        kept: { ...player("kept", "Kept"), teamAbbr: "NYK", injuryStatus: "out" },
      },
      date: "2026-10-20",
      schedule,
    })

    expect(
      options.filter(
        (option) =>
          option.value.startsWith("ir:") ||
          option.label.startsWith("To IR") ||
          /IR hold/i.test(option.label),
      ),
    ).toEqual([])
  })

  it("reverts a stale IR choice to Hold", () => {
    expect(resolveStoredIrParkValue("ir:b", [{ value: "ir:b", label: "To IR · Beta" }])).toBe("ir:b")
    expect(resolveStoredIrParkValue("ir:b", [])).toBe("hold")
    expect(resolveStoredIrParkValue("hold", [])).toBe("hold")
  })
})

describe("collectEarlierAddedStreamerIds", () => {
  it("returns streamers still held before the target cell", () => {
    const plan = {
      spotCount: 1,
      addsUsed: 1,
      addLimit: 3,
      gameStarts: 1,
      summaryReasons: [],
      days: [
        {
          date: "2025-11-03",
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-a",
              action: "add" as const,
              droppedPlayerId: null,
              rosterDropPlayerId: "bench",
              rosterDropKind: "player" as const,
              addIndex: 1,
              alternativePlayerIds: [],
              targetCategoryIds: [],
            },
          ],
        },
        {
          date: "2025-11-04",
          cells: [
            {
              spotIndex: 0,
              playerId: "fa-a",
              action: "hold" as const,
              droppedPlayerId: null,
              rosterDropPlayerId: null,
              rosterDropKind: "none" as const,
              addIndex: null,
              alternativePlayerIds: [],
              targetCategoryIds: [],
            },
          ],
        },
      ],
      opponentDays: [],
    }
    expect(
      collectEarlierAddedStreamerIds(plan as never, "2025-11-04", 0),
    ).toEqual(["fa-a"])
  })
})
