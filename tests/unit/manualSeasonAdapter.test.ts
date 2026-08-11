import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"

describe("manualToSeasonLeagueState", () => {
  it("creates a manual 12-team league with full slot rosters and shooting data", () => {
    const state = manualToSeasonLeagueState(fixture as ManualSeasonLeagueInput)

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

  it("preserves team abbreviations on players", () => {
    const state = manualToSeasonLeagueState({
      ...(fixture as ManualSeasonLeagueInput),
      name: "With teams",
    })

    expect(
      state.players.every(
        (player) =>
          typeof player.teamAbbr === "string" && player.teamAbbr.length >= 2,
      ),
    ).toBe(true)
    expect(state.players[0]?.teamAbbr).toBeTruthy()
  })
})
