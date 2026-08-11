import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import { manualToSeasonLeagueState } from "@/lib/adapters/manualSeason"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"

describe("manualToSeasonLeagueState", () => {
  it("creates a manual 12-team league with full slot rosters and shooting data", () => {
    const state = manualToSeasonLeagueState(fixture)

    expect(state).toMatchObject({
      name: fixture.name,
      season: fixture.season,
      perspectiveTeamIndex: 2,
      source: "manual",
    })
    expect(state.teams).toHaveLength(12)
    expect(state.teams.every((team) => team.entries.length === 14)).toBe(true)
    expect(state.teams[2].entries.map((entry) => entry.slot)).toEqual(SEASON_ROSTER_SLOTS)
    expect(state.players).toHaveLength(12 * 14)
    expect(state.players[0].shooting).toEqual({
      FGM: expect.any(Number),
      FGA: expect.any(Number),
      FTM: expect.any(Number),
      FTA: expect.any(Number),
    })
  })
})
