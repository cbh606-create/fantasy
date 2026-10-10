import { describe, expect, it } from "vitest"
import sample from "../../data/fixtures/espn-api-season-league-sample.json"
import freeAgentsSample from "../../data/fixtures/espn-api-free-agents-sample.json"
import {
  mapEspnFreeAgentPlayers,
  mapEspnLeagueToSeasonState,
  mapEspnLineupSlot,
  type EspnFreeAgentsPayload,
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

describe("mapEspnFreeAgentPlayers", () => {
  it("maps ESPN free agents and waiver players with availability", () => {
    const players = mapEspnFreeAgentPlayers(
      freeAgentsSample as EspnFreeAgentsPayload,
      2026,
    )

    expect(players).toHaveLength(2)
    expect(players[0]).toMatchObject({
      id: "9001",
      name: "Sample FA",
      teamAbbr: "ATL",
      availability: "fa",
    })
    expect(players[1]).toMatchObject({
      id: "9002",
      name: "Sample Waiver",
      teamAbbr: "BOS",
      availability: "waiver",
    })
  })

  it("stores the actual per-game line on seasonRates", () => {
    const players = mapEspnFreeAgentPlayers(
      {
        players: [{
          status: "FREEAGENT",
          player: {
            id: 501,
            fullName: "Actual Wing",
            proTeamId: 1,
            defaultPositionId: 2,
            stats: [{
              seasonId: 2027,
              statSourceId: 0,
              statSplitTypeId: 0,
              stats: { "42": 24 },
              averageStats: {
                "0": 12,
                "1": 0.4,
                "2": 1,
                "3": 3,
                "6": 4,
                "11": 1.5,
                "13": 5,
                "14": 10,
                "15": 2,
                "16": 2,
                "17": 2,
                "19": 0.5,
                "20": 1,
              },
            }],
          },
        }],
      },
      2027,
    )

    expect(players[0].seasonRates).toEqual({
      gamesPlayed: 24,
      projections: {
        FG_PCT: 0.5,
        FT_PCT: 1,
        TPM: 2,
        REB: 4,
        AST: 3,
        STL: 1,
        BLK: 0.4,
        TO: 1.5,
        PTS: 12,
      },
      shooting: { FGM: 5, FGA: 10, FTM: 2, FTA: 2 },
    })
    expect(players[0].projections.PTS).toBeCloseTo(12 * 82)
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
      projections: expect.objectContaining({
        PTS: 24.1 * 82,
        AST: 6.5 * 82,
        TPM: 2.4 * 82,
      }),
    })
  })

  it("attaches per-game last-7 rates and skips empty splits", () => {
    const state = mapEspnLeagueToSeasonState(
      sample as EspnLeaguePayload,
      { leagueId: "120853513", season: 2026, teamId: 9 },
    )
    const star = state.players.find((player) => player.id === "201")
    const rim = state.players.find((player) => player.id === "202")
    expect(star?.recentRates?.l7?.projections.PTS).toBe(30)
    expect(star?.recentRates?.l15?.projections.PTS).toBe(28)
    expect(star?.recentRates?.l30?.projections.PTS).toBe(26)
    expect(star?.projections.PTS).toBeCloseTo(24.1 * 82)
    expect(rim?.recentRates?.l7).toBeUndefined()
  })

  it("packs team entries using custom ESPN roster slot counts", () => {
    const customPayload = structuredClone(sample) as EspnLeaguePayload
    customPayload.settings!.rosterSettings = {
      lineupSlotCounts: {
        "0": 2,
        "12": 1,
      },
    }

    const state = mapEspnLeagueToSeasonState(customPayload, {
      leagueId: "120853513",
      season: 2026,
      teamId: 9,
    })

    expect(state.rosterSlots).toEqual(["PG", "PG", "BE"])
    expect(state.teams[1].entries).toHaveLength(3)
    expect(state.teams[1].entries.map((entry) => entry.slot)).toEqual([
      "PG",
      "PG",
      "BE",
    ])
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
