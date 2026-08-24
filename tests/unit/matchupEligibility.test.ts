import { describe, expect, it } from "vitest"
import {
  activeSlotsFor,
  eligibleForSlot,
  rosterSlotsFor,
} from "@/lib/matchup/eligibility"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"

describe("eligibility", () => {
  it("defaults roster slots and active slots", () => {
    expect(rosterSlotsFor({})).toEqual(SEASON_ROSTER_SLOTS)
    expect(activeSlotsFor(SEASON_ROSTER_SLOTS)).toEqual(
      SEASON_ROSTER_SLOTS.filter((s) => s !== "BE" && s !== "IL"),
    )
  })

  it("allows PG into PG, G, UTIL; blocks C", () => {
    const pg = { positions: ["PG"] as const }
    expect(eligibleForSlot(pg, "PG")).toBe(true)
    expect(eligibleForSlot(pg, "G")).toBe(true)
    expect(eligibleForSlot(pg, "UTIL")).toBe(true)
    expect(eligibleForSlot(pg, "C")).toBe(false)
    expect(eligibleForSlot(pg, "BE")).toBe(true)
  })

  it("missing positions ??UTIL/BE/IL only", () => {
    expect(eligibleForSlot({}, "UTIL")).toBe(true)
    expect(eligibleForSlot({}, "PG")).toBe(false)
    expect(eligibleForSlot(undefined, "SG")).toBe(false)
  })
})
