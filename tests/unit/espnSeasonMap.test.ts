import { describe, expect, it } from "vitest"
import sample from "../../data/fixtures/espn-api-season-league-sample.json"
import {
  mapEspnLeagueToSeasonState,
  mapEspnLineupSlot,
  type EspnLeaguePayload,
} from "@/lib/adapters/espnSeasonMap"
import { EspnAdapterError } from "@/lib/adapters/errors"

describe("mapEspnLineupSlot", () => {
  it("maps ESPN lineup ids onto app season slots", () => {
    expect(mapEspnLineupSlot(0)).toBe("PG")
    expect(mapEspnLineupSlot(4)).toBe("C")
    expect(mapEspnLineupSlot(11)).toBe("UTIL")
    expect(mapEspnLineupSlot(12)).toBe("BE")
    expect(mapEspnLineupSlot(13)).toBe("IL")
    expect(mapEspnLineupSlot(8)).toBe("UTIL")
  })
})

describe("mapEspnLeagueToSeasonState", () => {
  it("maps teams players and perspective from ESPN teamId", () => {
    const state = mapEspnLeagueToSeasonState(
      sample as EspnLeaguePayload,
      { leagueId: "120853513", season: 2026, teamId: 9 },
    )

    expect(state.name).toBe("Sample Private League")
    expect(state.season).toBe(2026)
    expect(state.espnTeamId).toBe(9)
    expect(state.perspectiveTeamIndex).toBe(1)
    expect(state.teams).toHaveLength(2)
    expect(state.teams[1].name).toBe("My Roster")
    expect(state.teams[1].entries).toHaveLength(14)
    expect(state.teams[1].entries[0]).toEqual({
      slot: "PG",
      playerId: "201",
    })
    expect(state.teams[1].entries[4]).toEqual({
      slot: "C",
      playerId: "202",
    })
    expect(state.teams[1].entries[10]).toEqual({
      slot: "BE",
      playerId: "203",
    })

    const star = state.players.find((player) => player.id === "201")
    expect(star).toMatchObject({
      name: "Star Point",
      teamAbbr: "BOS",
      projections: expect.objectContaining({ PTS: 24.1, AST: 6.5 }),
    })
  })

  it("throws when teamId is missing from the payload", () => {
    expect(() =>
      mapEspnLeagueToSeasonState(sample as EspnLeaguePayload, {
        leagueId: "120853513",
        season: 2026,
        teamId: 99,
      }),
    ).toThrow(EspnAdapterError)
  })
})
