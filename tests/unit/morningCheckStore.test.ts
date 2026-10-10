import { describe, expect, it } from "vitest"
import {
  morningCheckForOpponent,
  parseMorningCheck,
} from "@/lib/matchup/morningCheckStore"

describe("parseMorningCheck", () => {
  it("returns null for empty or foreign weeks", () => {
    expect(parseMorningCheck(null)).toBeNull()
    expect(parseMorningCheck("{")).toBeNull()
    const raw = JSON.stringify({
      matchupStartDate: "2026-10-20",
      opponentTeamIndex: 3,
      checkedOn: "2026-10-21",
      closedDays: [],
      plan: null,
      actualsPending: false,
    })
    expect(
      morningCheckForOpponent(parseMorningCheck(raw), "2026-10-20", 3)?.checkedOn,
    ).toBe("2026-10-21")
    expect(
      morningCheckForOpponent(parseMorningCheck(raw), "2026-10-27", 3),
    ).toBeNull()
    expect(
      morningCheckForOpponent(parseMorningCheck(raw), "2026-10-20", 4),
    ).toBeNull()
  })
})
