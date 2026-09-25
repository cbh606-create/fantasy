import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"

describe("manualToSeasonLeagueState rosterSlots", () => {
  it("persists SEASON_ROSTER_SLOTS on manual leagues", () => {
    const state = manualToSeasonLeagueState(fixture as ManualSeasonLeagueInput)

    expect(state.rosterSlots).toEqual([
      "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL",
      "BE", "BE", "BE", "IL",
    ])
  })
})
