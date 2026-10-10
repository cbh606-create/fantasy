import { describe, expect, it } from "vitest"
import {
  mapEspnFreeAgentPlayers,
  mapEspnLeagueToSeasonState,
  type EspnFreeAgentsPayload,
  type EspnLeaguePayload,
} from "@/lib/adapters/espnSeasonMap"

describe("ESPN season positions", () => {
  it("maps eligible lineup slots to player positions", () => {
    const players = mapEspnFreeAgentPlayers({
      players: [{
        status: "FREEAGENT",
        player: {
          id: 1,
          fullName: "Combo Guard",
          eligibleSlots: [0, 5, 11, 12],
        },
      }],
    } as EspnFreeAgentsPayload, 2026)

    expect(players[0]?.positions).toEqual(["PG", "G"])
  })

  it("uses the default position when eligible slots are missing", () => {
    const players = mapEspnFreeAgentPlayers({
      players: [{
        status: "FREEAGENT",
        player: {
          id: 2,
          fullName: "Center",
          defaultPositionId: 4,
        },
      }],
    } as EspnFreeAgentsPayload, 2026)

    expect(players[0]?.positions).toEqual(["C"])
  })
})

describe("ESPN season roster slots", () => {
  it("expands lineup slot counts into the league roster template", () => {
    const payload: EspnLeaguePayload = {
      settings: {
        name: "Positions League",
        rosterSettings: {
          lineupSlotCounts: {
            "0": 1,
            "5": 2,
            "12": 3,
            "13": 1,
          },
        },
      },
      teams: [{ id: 9 }],
    }

    const state = mapEspnLeagueToSeasonState(payload, {
      leagueId: "league-1",
      season: 2026,
      teamId: 9,
    })

    expect(state.rosterSlots).toEqual([
      "PG",
      "G",
      "G",
      "BE",
      "BE",
      "BE",
      "IL",
    ])
  })

  it("omits the roster template when ESPN does not provide one", () => {
    const state = mapEspnLeagueToSeasonState({
      teams: [{ id: 9 }],
    }, {
      leagueId: "league-1",
      season: 2026,
      teamId: 9,
    })

    expect(state.rosterSlots).toBeUndefined()
  })
})
