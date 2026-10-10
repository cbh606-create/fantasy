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

  it("treats missing positions as eligible for every active slot", () => {
    expect(eligibleForSlot({}, "UTIL")).toBe(true)
    expect(eligibleForSlot({}, "PG")).toBe(true)
    expect(eligibleForSlot(undefined, "SG")).toBe(true)
    expect(eligibleForSlot({ positions: [] }, "C")).toBe(true)
  })

  it("lets G fill PG/SG and F fill SF/PF", () => {
    const guard = { positions: ["G"] as const }
    const forward = { positions: ["F"] as const }
    expect(eligibleForSlot(guard, "PG")).toBe(true)
    expect(eligibleForSlot(guard, "SG")).toBe(true)
    expect(eligibleForSlot(guard, "G")).toBe(true)
    expect(eligibleForSlot(guard, "C")).toBe(false)
    expect(eligibleForSlot(forward, "SF")).toBe(true)
    expect(eligibleForSlot(forward, "PF")).toBe(true)
    expect(eligibleForSlot(forward, "F")).toBe(true)
    expect(eligibleForSlot(forward, "PG")).toBe(false)
  })
})
