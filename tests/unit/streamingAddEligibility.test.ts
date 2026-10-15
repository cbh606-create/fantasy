import { describe, expect, it } from "vitest"
import {
  filterStreamAddEligibleOnDate,
  filterStreamAddPool,
  isOnNbaRosterThisSeason,
  isStreamAddEligibleOnDate,
} from "@/lib/matchup/streamingAddEligibility"
import { setExpectedReturnsForTests } from "@/lib/matchup/games"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"
import { afterEach } from "vitest"

const schedule = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2026-10-20",
    endDate: "2026-10-22",
    days: ["2026-10-20", "2026-10-21", "2026-10-22"],
  },
  games: [
    { date: "2026-10-20", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2026-10-21", homeAbbr: "BOS", awayAbbr: "CHI" },
  ],
} satisfies ScheduleResponse

const base = (
  overrides: Partial<SeasonPlayer> & Pick<SeasonPlayer, "id">,
): SeasonPlayer => ({
  name: overrides.id,
  teamAbbr: "BOS",
  projectedGames: 82,
  projections: {
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 1,
    REB: 1,
    AST: 1,
    STL: 1,
    BLK: 1,
    TO: 1,
    PTS: 1,
  },
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
  ...overrides,
})

describe("streamingAddEligibility", () => {
  afterEach(() => {
    setExpectedReturnsForTests(null)
  })

  it("rejects players with only a stale team abbr and no season games footprint", () => {
    const retired = base({
      id: "retired",
      teamAbbr: "BOS",
      projectedGames: undefined,
    })
    expect(isOnNbaRosterThisSeason(retired)).toBe(false)
    expect(isStreamAddEligibleOnDate(retired, "2026-10-20", schedule)).toBe(
      false,
    )
  })

  it("rejects unsigned pool footprints even when ESPN still has a last team", () => {
    const retired = base({
      id: "chris-paul",
      teamAbbr: "LAC",
      projectedGames: undefined,
    })
    expect(filterStreamAddPool([retired])).toHaveLength(0)
    expect(isStreamAddEligibleOnDate(retired, "2026-10-20", schedule)).toBe(
      false,
    )
  })

  it("rejects players with no team game on the add date", () => {
    const player = base({ id: "bos", teamAbbr: "BOS" })
    expect(isStreamAddEligibleOnDate(player, "2026-10-22", schedule)).toBe(
      false,
    )
  })

  it("rejects out players even when their team plays", () => {
    const player = base({
      id: "out",
      teamAbbr: "BOS",
      injuryStatus: "out",
    })
    expect(isStreamAddEligibleOnDate(player, "2026-10-20", schedule)).toBe(
      false,
    )
  })

  it("rejects players whose expected return is after the add date", () => {
    setExpectedReturnsForTests([
      { name: "injured", espnId: "inj-1", returnDate: "2026-10-25" },
    ])
    const player = base({ id: "espn-inj-1", name: "injured", teamAbbr: "BOS" })
    expect(isStreamAddEligibleOnDate(player, "2026-10-20", schedule)).toBe(
      false,
    )
    expect(isStreamAddEligibleOnDate(player, "2026-10-25", schedule)).toBe(
      false,
    )
  })

  it("keeps rostered players who play that day", () => {
    const player = base({ id: "active", teamAbbr: "BOS" })
    expect(isStreamAddEligibleOnDate(player, "2026-10-20", schedule)).toBe(
      true,
    )
    expect(filterStreamAddPool([player])).toHaveLength(1)
    expect(
      filterStreamAddEligibleOnDate([player], "2026-10-20", schedule),
    ).toHaveLength(1)
  })
})
