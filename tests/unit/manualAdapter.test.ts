import { describe, expect, it } from "vitest"
import samplePlayers from "../../data/fixtures/players-sample.json"
import { manualToLeagueState } from "@/lib/adapters/manual"
import { manualLeagueInputSchema } from "@/lib/adapters/types"
import type { Player } from "@/lib/domain/types"

describe("manualLeagueInputSchema", () => {
  it("defaults rounds to 13 and teams to 12 when omitted", () => {
    const input = manualLeagueInputSchema.parse({
      userPickSlot: 1,
      players: samplePlayers as Player[],
    })

    expect(input.rounds).toBe(13)
    expect(input.teams).toBe(12)
  })

  it("accepts ESPN league sizes from 4 to 20", () => {
    expect(
      manualLeagueInputSchema.parse({
        teams: 4,
        userPickSlot: 4,
        rounds: 3,
        players: samplePlayers as Player[],
      }).teams,
    ).toBe(4)

    expect(
      manualLeagueInputSchema.parse({
        teams: 20,
        userPickSlot: 20,
        rounds: 3,
        players: samplePlayers as Player[],
      }).teams,
    ).toBe(20)
  })

  it("rejects team counts outside ESPN bounds", () => {
    expect(() =>
      manualLeagueInputSchema.parse({
        teams: 3,
        userPickSlot: 1,
        players: samplePlayers as Player[],
      }),
    ).toThrow()

    expect(() =>
      manualLeagueInputSchema.parse({
        teams: 21,
        userPickSlot: 1,
        players: samplePlayers as Player[],
      }),
    ).toThrow()
  })

  it("rejects pick slots beyond the selected team count", () => {
    expect(() =>
      manualLeagueInputSchema.parse({
        teams: 8,
        userPickSlot: 9,
        players: samplePlayers as Player[],
      }),
    ).toThrow()
  })
})

describe("manualToLeagueState", () => {
  it("builds state from fixture players with 12 teams and board length 12*rounds", () => {
    const input = manualLeagueInputSchema.parse({
      userPickSlot: 3,
      players: samplePlayers as Player[],
    })

    const state = manualToLeagueState(input)

    expect(state.source).toBe("manual")
    expect(state.settings.teams).toBe(12)
    expect(state.settings.rounds).toBe(13)
    expect(state.board.picks).toHaveLength(12 * 13)
    expect(state.perspectiveTeamIndex).toBe(2)
    expect(state.players).toEqual(samplePlayers)
  })

  it("builds an 8-team snake board when requested", () => {
    const input = manualLeagueInputSchema.parse({
      teams: 8,
      userPickSlot: 5,
      rounds: 13,
      players: samplePlayers as Player[],
    })

    const state = manualToLeagueState(input)

    expect(state.settings.teams).toBe(8)
    expect(state.board.picks).toHaveLength(8 * 13)
    expect(state.perspectiveTeamIndex).toBe(4)
    expect(state.board.picks[0].teamIndex).toBe(0)
    expect(state.board.picks[7].teamIndex).toBe(7)
    expect(state.board.picks[8].teamIndex).toBe(7)
  })

  it("builds a 14-team snake board when requested", () => {
    const input = manualLeagueInputSchema.parse({
      teams: 14,
      userPickSlot: 1,
      rounds: 3,
      players: samplePlayers as Player[],
    })

    const state = manualToLeagueState(input)

    expect(state.settings.teams).toBe(14)
    expect(state.board.picks).toHaveLength(14 * 3)
  })

  it("applies pre-filled picks and advances currentOverall", () => {
    const input = manualLeagueInputSchema.parse({
      userPickSlot: 1,
      rounds: 3,
      players: samplePlayers as Player[],
      picks: [{ overall: 1, playerId: "p01" }],
    })

    const state = manualToLeagueState(input)

    expect(state.board.picks[0].playerId).toBe("p01")
    expect(state.board.currentOverall).toBe(2)
    expect(state.board.picks).toHaveLength(12 * 3)
  })
})
