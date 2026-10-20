import { describe, expect, it } from "vitest"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import {
  applyPastSwapToDaily,
  clearPastActualSpot,
  parsePastActualSwaps,
  pastActualCell,
  pastActualStorageKey,
  readPastActualSwaps,
  upsertPastActualSwap,
  writePastActualSwaps,
} from "@/lib/matchup/pastActualSwaps"

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe("pastActualSwaps", () => {
  it("keeps a record for one matchup week only", () => {
    const storage = memory()
    const swap = {
      date: "2026-10-20",
      spotIndex: 0,
      addedPlayerId: "fa-add",
      drop: "sit",
    }
    writePastActualSwaps("league-a", "2026-10-19", [swap], storage)

    expect(pastActualStorageKey("league-a", "2026-10-19")).toBe(
      "matchup-past-swaps:league-a:2026-10-19",
    )
    expect(readPastActualSwaps("league-a", "2026-10-19", storage)).toEqual([swap])
    expect(readPastActualSwaps("league-a", "2026-10-26", storage)).toEqual([])
    expect(parsePastActualSwaps("not-json")).toEqual([])
  })

  it("replaces the same date and spot and can clear it", () => {
    const first = {
      date: "2026-10-20",
      spotIndex: 0,
      addedPlayerId: "fa-add",
      drop: "sit",
    }
    const next = { ...first, addedPlayerId: "fa-other" }
    const saved = upsertPastActualSwap([first], next)
    expect(saved).toEqual([next])
    expect(clearPastActualSpot(saved, "2026-10-20", 0)).toEqual([])
  })

  it("builds an empty cell when nothing was added and a drop-add cell when someone was", () => {
    expect(pastActualCell(undefined, 0, 3)).toMatchObject({
      spotIndex: 0,
      playerId: null,
      action: "empty",
      addIndex: null,
      rosterDropKind: "none",
    })
    expect(
      pastActualCell(
        {
          date: "2026-10-20",
          spotIndex: 1,
          addedPlayerId: "fa-add",
          drop: "sit",
        },
        1,
        3,
      ),
    ).toMatchObject({
      spotIndex: 1,
      playerId: "fa-add",
      action: "drop_add",
      droppedPlayerId: "sit",
      rosterDropKind: "player",
      rosterDropPlayerId: "sit",
      addIndex: 4,
    })
    expect(
      pastActualCell(
        {
          date: "2026-10-20",
          spotIndex: 0,
          addedPlayerId: null,
          drop: "ir:sit",
        },
        0,
        3,
      ),
    ).toMatchObject({
      playerId: null,
      action: "empty",
      addIndex: null,
      rosterDropKind: "ir",
      rosterDropPlayerId: "sit",
    })
  })

  it("removes a dropped player and seats the add from that date forward", () => {
    const days = ["2026-10-20", "2026-10-21"]
    const lineup = [
      { slot: "SG" as const, playerId: "sit" },
      { slot: "IL" as const, playerId: null },
    ]
    const daily: DailyLineups = {
      [days[0]!]: lineup.map((entry) => ({ ...entry })),
      [days[1]!]: lineup.map((entry) => ({ ...entry })),
    }
    const next = applyPastSwapToDaily(
      daily,
      {
        date: days[0]!,
        spotIndex: 0,
        addedPlayerId: "fa-add",
        drop: "sit",
      },
      days[0]!,
      days,
    )

    expect(next[days[0]!]?.some((entry) => entry.playerId === "sit")).toBe(false)
    expect(next[days[0]!]?.some((entry) => entry.playerId === "fa-add")).toBe(true)
    expect(next[days[1]!]?.some((entry) => entry.playerId === "sit")).toBe(false)
    expect(next[days[1]!]?.some((entry) => entry.playerId === "fa-add")).toBe(true)
  })

  it("parks a To IR drop on IL and does not remove anyone for hold", () => {
    const days = ["2026-10-20"]
    const daily: DailyLineups = {
      [days[0]!]: [
        { slot: "SG", playerId: "sit" },
        { slot: "IL", playerId: null },
      ],
    }
    const parked = applyPastSwapToDaily(
      daily,
      {
        date: days[0]!,
        spotIndex: 0,
        addedPlayerId: "fa-add",
        drop: "ir:sit",
      },
      days[0]!,
      days,
    )
    expect(parked[days[0]!]?.find((entry) => entry.slot === "IL")?.playerId).toBe("sit")
    expect(parked[days[0]!]?.some((entry) => entry.slot !== "IL" && entry.playerId === "sit")).toBe(false)

    const held = applyPastSwapToDaily(
      daily,
      {
        date: days[0]!,
        spotIndex: 0,
        addedPlayerId: null,
        drop: "hold",
      },
      days[0]!,
      days,
    )
    expect(held[days[0]!]?.find((entry) => entry.slot === "SG")?.playerId).toBe("sit")
  })
})
