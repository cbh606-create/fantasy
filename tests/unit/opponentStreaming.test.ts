import { describe, expect, it } from "vitest"
import {
  emptyNonIlSeatCount,
  resolveOppSpotCount,
} from "@/lib/matchup/opponentStreaming"

describe("resolveOppSpotCount", () => {
  it("counts empty non-IL seats", () => {
    const entries = [
      { slot: "UTIL" as const, playerId: "opp-1" },
      { slot: "BE" as const, playerId: null },
      { slot: "BE" as const, playerId: null },
      { slot: "IL" as const, playerId: null },
    ]
    expect(emptyNonIlSeatCount(entries)).toBe(2)
  })

  it("returns the manual choice as-is", () => {
    expect(resolveOppSpotCount(3, [{ slot: "UTIL", playerId: "opp-1" }])).toBe(3)
    expect(resolveOppSpotCount(1)).toBe(1)
    expect(resolveOppSpotCount(0, [{ slot: "UTIL", playerId: null }])).toBe(0)
  })
})
