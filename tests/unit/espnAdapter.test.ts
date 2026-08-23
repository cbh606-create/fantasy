import { describe, expect, it } from "vitest"
import { EspnAdapterError } from "@/lib/adapters/errors"
import { espnImportToLeagueState, espnSyncBoard } from "@/lib/adapters/espn"

const params = {
  leagueId: "fixture-league",
  season: 2026,
}

describe("espnImportToLeagueState", () => {
  it("maps the ESPN fixture to an ESPN league state", async () => {
    const state = await espnImportToLeagueState(params)

    expect(state.source).toBe("espn")
    expect(state.settings.teams).toBe(12)
    expect(state.settings.rounds).toBe(13)
    expect(state.perspectiveTeamIndex).toBe(2)
    expect(state.players.length).toBeGreaterThan(0)
    expect(state.board.picks).toHaveLength(12 * 13)
    expect(state.board.picks[0].playerId).toBe("p01")
    expect(state.board.currentOverall).toBe(3)
  })

  it("honors an ESPN-sized teams override on the fixture path", async () => {
    const state = await espnImportToLeagueState({
      ...params,
      teams: 10,
      userPickSlot: 7,
    })

    expect(state.settings.teams).toBe(10)
    expect(state.settings.userPickSlot).toBe(7)
    expect(state.perspectiveTeamIndex).toBe(6)
    expect(state.board.picks).toHaveLength(10 * 13)
  })

  it("throws a typed adapter error for a simulated failure", async () => {
    const request = espnImportToLeagueState({
      ...params,
      forceFail: "ESPN_TIMEOUT",
    })

    await expect(request).rejects.toBeInstanceOf(EspnAdapterError)
    await expect(request).rejects.toMatchObject({ code: "ESPN_TIMEOUT" })
  })
})

describe("espnSyncBoard", () => {
  it("applies ESPN picks while preserving and reporting local conflicts", async () => {
    const localState = await espnImportToLeagueState(params)
    localState.source = "manual"
    localState.board.picks[0].playerId = "p02"
    localState.board.picks[1].playerId = null
    localState.board.picks[2].playerId = "p03"

    const result = await espnSyncBoard(localState, params)

    expect(result.state.board.picks[0].playerId).toBe("p02")
    expect(result.state.board.picks[1].playerId).toBe("p02")
    expect(result.state.board.picks[2].playerId).toBe("p03")
    expect(result.conflicts).toEqual([1])
    expect(result.state.source).toBe("mixed")
    expect(result.state.board.currentOverall).toBe(4)
  })
})
