import { describe, expect, it } from "vitest"
import {
  emptyNonIlSeatCount,
  resolveOppSpotCount,
} from "@/lib/matchup/opponentStreaming"

describe("resolveOppSpotCount", () => {
  it("uses two empty non-IL seats as Auto 2", () => {
    const entries = [
      { slot: "UTIL" as const, playerId: "opp-1" },
      { slot: "BE" as const, playerId: null },
      { slot: "BE" as const, playerId: null },
      { slot: "IL" as const, playerId: null },
    ]
    expect(emptyNonIlSeatCount(entries)).toBe(2)
    expect(resolveOppSpotCount("auto", entries)).toBe(2)
  })

  it("uses 1 spot when Auto and every non-IL seat is filled", () => {
    const entries = [
      { slot: "UTIL" as const, playerId: "opp-1" },
      { slot: "IL" as const, playerId: null },
    ]
    expect(emptyNonIlSeatCount(entries)).toBe(0)
    expect(resolveOppSpotCount("auto", entries)).toBe(1)
  })

  it("honors a manual 3 override", () => {
    expect(resolveOppSpotCount(3, [{ slot: "UTIL", playerId: "opp-1" }])).toBe(3)
  })
})
