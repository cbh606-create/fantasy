import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearEspnStatCache,
  loadEspnBreakoutPlayers,
} from "@/lib/injuries/espnStatCache"

const row = (
  id: string,
  sourceId: number,
  splitId: number,
  minutes: number,
  games: number,
) => ({
  id,
  seasonId: 2026,
  statSourceId: sourceId,
  statSplitTypeId: splitId,
  stats: {
    "0": 10 * games,
    "1": games,
    "2": games,
    "3": 2 * games,
    "6": 3 * games,
    "11": games,
    "13": 4 * games,
    "14": 10 * games,
    "15": 2 * games,
    "16": 4 * games,
    "17": games,
    "40": minutes * games,
    "42": games,
  },
})

const payload = [
  {
    id: 44,
    stats: [row("002026", 0, 0, 20, 10), row("102026", 1, 0, 30, 70)],
  },
]

const fetchOk = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))

describe("loadEspnBreakoutPlayers", () => {
  afterEach(() => {
    clearEspnStatCache()
  })

  it("reads minutes from stat totals and reuses the snapshot for 6 hours", async () => {
    const first = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T12:00:00.000Z"),
      fetchImpl: fetchOk,
    })

    expect(first.source).toBe("espn")
    expect(first.players).toEqual([
      expect.objectContaining({
        id: "44",
        seasonGames: 10,
        season: expect.objectContaining({ minutesPerGame: 20 }),
        projection: expect.objectContaining({ minutesPerGame: 30 }),
      }),
    ])

    const second = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T17:59:00.000Z"),
      fetchImpl: fetchOk,
    })

    expect(fetchOk).toHaveBeenCalledTimes(1)
    expect(second.players[0]?.id).toBe("44")
  })

  it("keeps the previous snapshot when the refresh fails", async () => {
    await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T12:00:00.000Z"),
      fetchImpl: fetchOk,
    })

    const failed = vi.fn(async () => new Response("nope", { status: 500 }))
    const next = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T19:00:00.000Z"),
      fetchImpl: failed,
    })

    expect(next.source).toBe("espn")
    expect(next.players[0]?.id).toBe("44")
  })

  it("returns an empty source when the first fetch fails", async () => {
    const failed = vi.fn(async () => {
      throw new Error("offline")
    })
    const result = await loadEspnBreakoutPlayers({
      seasonId: 2026,
      now: new Date("2026-10-15T12:00:00.000Z"),
      fetchImpl: failed,
    })

    expect(result).toEqual({ players: [], source: "empty" })
  })
})
