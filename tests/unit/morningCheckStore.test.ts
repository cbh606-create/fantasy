import { describe, expect, it } from "vitest"
import {
  morningCheckForOpponent,
  parseMorningCheck,
  savedClosedCoversEspnDates,
  type MorningCheckRecord,
} from "@/lib/matchup/morningCheckStore"
import { emptyCategoryTotals } from "@/lib/matchup/morningCheck"

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

describe("savedClosedCoversEspnDates", () => {
  const previous = (dates: string[], pending = false): MorningCheckRecord => ({
    matchupStartDate: "2026-10-20",
    opponentTeamIndex: 1,
    checkedOn: "2026-10-20",
    closedDays: dates.map((date) => ({
      date,
      youStartableIds: [],
      oppStartableIds: [],
      youActual: emptyCategoryTotals(),
      oppActual: emptyCategoryTotals(),
      youPlayedIds: [],
      oppPlayedIds: [],
      youShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
      oppShooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
    })),
    plan: null,
    actualsPending: pending,
  })

  it("reuses when ESPN-closed dates are already saved", () => {
    expect(
      savedClosedCoversEspnDates(previous(["2026-10-20"]), ["2026-10-20"]),
    ).toBe(true)
  })

  it("refetches when a new ESPN-closed date appears the same calendar day", () => {
    expect(
      savedClosedCoversEspnDates(previous(["2026-10-20"]), [
        "2026-10-20",
        "2026-10-21",
      ]),
    ).toBe(false)
  })

  it("refetches when the saved check is still pending", () => {
    expect(
      savedClosedCoversEspnDates(previous(["2026-10-20"], true), ["2026-10-20"]),
    ).toBe(false)
  })
})
