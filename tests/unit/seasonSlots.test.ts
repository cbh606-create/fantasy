import { describe, expect, it } from "vitest"
import { SEASON_ROSTER_SLOTS, buildEmptyTeamEntries } from "@/lib/season/slots"

describe("season slots", () => {
  it("has 10 starters, 3 BE, 1 IL in order", () => {
    expect(SEASON_ROSTER_SLOTS).toEqual([
      "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL",
      "BE", "BE", "BE", "IL",
    ])
    expect(buildEmptyTeamEntries()).toHaveLength(14)
    expect(buildEmptyTeamEntries().every((e) => e.playerId === null)).toBe(true)
  })
})
