import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import scheduleFixture from "../../data/fixtures/nba-matchup-schedule.json"
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
    expect(state.players).toHaveLength(12 * 14 + 24)
    expect(state.availablePlayerIds).toHaveLength(24)
    expect(state.waiverOrder.indexOf(state.perspectiveTeamIndex)).toBe(2)
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

  it("gives every player on the perspective roster a varied matchup schedule", () => {
    const state = manualToSeasonLeagueState(fixture as ManualSeasonLeagueInput)
    const perspectiveTeam = state.teams[state.perspectiveTeamIndex]
    const gamesByTeam = scheduleFixture.games.reduce<Record<string, number>>(
      (counts, game) => {
        counts[game.homeAbbr] = (counts[game.homeAbbr] ?? 0) + 1
        counts[game.awayAbbr] = (counts[game.awayAbbr] ?? 0) + 1
        return counts
      },
      {},
    )
    const perspectiveGameCounts = perspectiveTeam.entries.map((entry) => {
      const player = state.players.find(({ id }) => id === entry.playerId)
      return gamesByTeam[player?.teamAbbr ?? ""] ?? 0
    })

    expect(perspectiveGameCounts.every((games) => games > 0)).toBe(true)
    expect(new Set(perspectiveGameCounts).size).toBeGreaterThan(1)
  })
})
