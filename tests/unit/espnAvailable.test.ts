import { describe, expect, it } from "vitest"
import {
  deriveAvailableFromOwnership,
  mergeAvailablePlayers,
  rosteredPlayerIds,
} from "@/lib/adapters/espnAvailable"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const blankPlayer = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  projections: {
    FG_PCT: 0,
    FT_PCT: 0,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 0,
  },
  shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
})

const baseState = (): SeasonLeagueState => ({
  name: "Test",
  season: 2026,
  categories: [],
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "PG", playerId: "p1" },
        { slot: "SG", playerId: null },
      ],
    },
    {
      teamIndex: 1,
      name: "Opp",
      entries: [{ slot: "PG", playerId: "p2" }],
    },
  ],
  players: [
    blankPlayer("p1", "A"),
    blankPlayer("p2", "B"),
    blankPlayer("p3", "C"),
  ],
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "espn",
})

describe("espnAvailable", () => {
  it("collects rostered ids ignoring null slots", () => {
    expect([...rosteredPlayerIds(baseState())].sort()).toEqual(["p1", "p2"])
  })

  it("derives available as players minus rostered", () => {
    expect(deriveAvailableFromOwnership(baseState())).toEqual(["p3"])
  })

  it("merges FA players and sets availablePlayerIds", () => {
    const fa = {
      ...blankPlayer("fa1", "Free"),
      availability: "waiver" as const,
    }
    const next = mergeAvailablePlayers(baseState(), [fa], "espn_fa")
    expect(next.availablePlayerIds).toEqual(["fa1"])
    expect(next.players.find((p) => p.id === "fa1")?.availability).toBe("waiver")
    expect(next.players).toHaveLength(4)
  })

  it("does not mark rostered players as available when merging overlap", () => {
    const next = mergeAvailablePlayers(
      baseState(),
      [blankPlayer("p1", "A"), blankPlayer("fa1", "Free")],
      "espn_fa",
    )
    expect(next.availablePlayerIds).toEqual(["fa1"])
  })
})
