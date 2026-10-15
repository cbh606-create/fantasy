import { describe, expect, it } from "vitest"
import {
  dailyLineupsMatchRoster,
  pruneDailyToRoster,
  type DailyLineups,
} from "@/lib/matchup/dailyLineups"

describe("dailyLineupsMatchRoster", () => {
  it("rejects stored lineups that still seat cut players", () => {
    const daily: DailyLineups = {
      "2026-10-20": [{ slot: "PG", playerId: "old-star" }],
    }
    expect(
      dailyLineupsMatchRoster(daily, [{ slot: "PG", playerId: "new-star" }]),
    ).toBe(false)
    expect(
      dailyLineupsMatchRoster(daily, [{ slot: "PG", playerId: "old-star" }]),
    ).toBe(true)
  })
})

describe("pruneDailyToRoster", () => {
  it("clears cut players from open days and can preserve closed days", () => {
    const daily: DailyLineups = {
      "2026-10-20": [{ slot: "PG", playerId: "cut" }],
      "2026-10-21": [{ slot: "PG", playerId: "cut" }],
      "2026-10-22": [{ slot: "PG", playerId: "keeper" }],
    }
    const rosterIds = new Set(["keeper"])
    const pruned = pruneDailyToRoster(
      daily,
      rosterIds,
      new Set(["2026-10-20"]),
    )
    expect(pruned["2026-10-20"]?.[0]?.playerId).toBe("cut")
    expect(pruned["2026-10-21"]?.[0]?.playerId).toBeNull()
    expect(pruned["2026-10-22"]?.[0]?.playerId).toBe("keeper")
  })

  it("keeps preview streamer adds that are not on the roster", () => {
    const daily: DailyLineups = {
      "2026-10-21": [
        { slot: "PG", playerId: "keeper" },
        { slot: "UTIL", playerId: "fa-add" },
      ],
    }
    const pruned = pruneDailyToRoster(
      daily,
      new Set(["keeper"]),
      undefined,
      new Set(["fa-add"]),
    )
    expect(pruned["2026-10-21"]?.map((entry) => entry.playerId)).toEqual([
      "keeper",
      "fa-add",
    ])
  })

  it("without keepIds, opponent FA streamers are wiped (the Day Comparison GP bug)", () => {
    const daily: DailyLineups = {
      "2026-10-20": [
        { slot: "PG", playerId: "opp-star" },
        { slot: "UTIL", playerId: "fa-stream" },
      ],
    }
    const oppRosterIds = new Set(["opp-star"])
    const wiped = pruneDailyToRoster(daily, oppRosterIds)
    expect(wiped["2026-10-20"]?.map((entry) => entry.playerId)).toEqual([
      "opp-star",
      null,
    ])
    const kept = pruneDailyToRoster(
      daily,
      oppRosterIds,
      undefined,
      new Set(["fa-stream"]),
    )
    expect(kept["2026-10-20"]?.map((entry) => entry.playerId)).toEqual([
      "opp-star",
      "fa-stream",
    ])
  })
})
