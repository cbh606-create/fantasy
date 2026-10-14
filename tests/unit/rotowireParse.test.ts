import { describe, expect, it } from "vitest"
import {
  parseConfirmedLineups,
  parseDepthChart,
  parseInjuryUpdates,
  parseRotoPlayers,
} from "@/lib/injuries/rotowireParse"

describe("parseInjuryUpdates", () => {
  it("keeps OUT and GTD and marks anything else as other", () => {
    const updates = parseInjuryUpdates({
      Updates: [
        {
          DateTime: "2026-01-14T18:00:00.000Z",
          Injury: { Status: "OUT" },
          Player: { Id: "1" },
          Team: { Code: "ATL" },
        },
        {
          DateTime: "2026-01-14T19:00:00.000Z",
          Injury: { Status: "QUESTIONABLE" },
          Player: { Id: "2" },
          Team: { Code: "BOS" },
        },
      ],
    })

    expect(updates).toEqual([
      {
        rotowirePlayerId: "1",
        teamAbbr: "ATL",
        status: "out",
        at: "2026-01-14T18:00:00.000Z",
      },
      {
        rotowirePlayerId: "2",
        teamAbbr: "BOS",
        status: "other",
        at: "2026-01-14T19:00:00.000Z",
      },
    ])
  })
})

describe("parseDepthChart", () => {
  it("orders each position by rank", () => {
    const depth = parseDepthChart({
      Teams: [
        {
          Code: "ATL",
          Players: [
            { Id: "2", Position: "PG", Rank: "2" },
            { Id: "1", Position: "PG", Rank: "1" },
          ],
        },
      ],
    })

    expect(depth.teams[0]?.positions[0]?.playerIds).toEqual(["1", "2"])
  })
})

describe("parseConfirmedLineups", () => {
  it("drops a lineup that is not confirmed", () => {
    const lineups = parseConfirmedLineups({
      Games: [
        {
          DateTime: "2026-01-15T01:00:00.000Z",
          Status: "Projected",
          Team: { Code: "ATL" },
          Starters: [{ Id: "2", Position: "PG" }],
        },
        {
          DateTime: "2026-01-15T01:00:00.000Z",
          Confirmed: true,
          Team: { Code: "ATL" },
          Starters: [{ Id: "2", Position: "PG" }],
        },
      ],
    })

    expect(lineups).toEqual([
      {
        teamAbbr: "ATL",
        startsAt: "2026-01-15T01:00:00.000Z",
        starters: [{ playerId: "2", position: "PG" }],
      },
    ])
  })
})

describe("parseRotoPlayers", () => {
  it("reads team rosters and free agents", () => {
    const players = parseRotoPlayers({
      FreeAgents: [{ Id: "9", FirstName: "Shaqquan", LastName: "Aaron" }],
      Teams: [
        {
          Code: "ATL",
          Players: [{ Id: "4765", FirstName: "Nickeil", LastName: "Alexander-Walker" }],
        },
      ],
    })

    expect(players).toEqual([
      { id: "9", firstName: "Shaqquan", lastName: "Aaron", teamAbbr: "" },
      {
        id: "4765",
        firstName: "Nickeil",
        lastName: "Alexander-Walker",
        teamAbbr: "ATL",
      },
    ])
  })
})
