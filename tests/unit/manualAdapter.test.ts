import { describe, expect, it } from "vitest"
import samplePlayers from "../../data/fixtures/players-sample.json"
import { manualToLeagueState } from "@/lib/adapters/manual"
import { manualLeagueInputSchema } from "@/lib/adapters/types"
import type { Player } from "@/lib/domain/types"

describe("manualLeagueInputSchema", () => {
  it("defaults rounds to 13 when omitted", () => {
    const input = manualLeagueInputSchema.parse({
      userPickSlot: 1,
      players: samplePlayers as Player[],
    })

    expect(input.rounds).toBe(13)
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
