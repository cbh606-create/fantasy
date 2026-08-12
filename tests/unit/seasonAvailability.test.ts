import { describe, expect, it } from "vitest"
import { normalizeSeasonAvailability } from "@/lib/season/availability"
import type { SeasonLeagueState } from "@/lib/season/types"

type LegacySeasonLeagueState = Omit<
  SeasonLeagueState,
  "availablePlayerIds" | "waiverOrder"
>

const projections = {
  FG_PCT: 0,
  FT_PCT: 0,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
}

const createLegacyState = (): LegacySeasonLeagueState => ({
  name: "Availability test",
  season: 2026,
  categories: [],
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "Team 1",
      entries: [{ slot: "PG", playerId: "rostered-id" }],
    },
    {
      teamIndex: 1,
      name: "Team 2",
      entries: [{ slot: "PG", playerId: null }],
    },
  ],
  players: [
    {
      id: "rostered-id",
      name: "Rostered Player",
      projections,
      shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
    },
    {
      id: "free-agent-id",
      name: "Free Agent",
      projections,
      shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
    },
  ],
  source: "manual",
})

describe("normalizeSeasonAvailability", () => {
  it("defaults missing availablePlayerIds and waiverOrder", () => {
    const normalized = normalizeSeasonAvailability(
      createLegacyState() as SeasonLeagueState,
    )

    expect(normalized.availablePlayerIds).toEqual([])
    expect(normalized.waiverOrder).toEqual([0, 1])
  })

  it("drops available ids that are rostered", () => {
    const normalized = normalizeSeasonAvailability({
      ...createLegacyState(),
      availablePlayerIds: ["rostered-id", "free-agent-id"],
      waiverOrder: [1, 0],
    })

    expect(normalized.availablePlayerIds).toEqual(["free-agent-id"])
  })

  it("drops available ids that do not identify a player", () => {
    const normalized = normalizeSeasonAvailability({
      ...createLegacyState(),
      availablePlayerIds: ["missing-id", "free-agent-id"],
      waiverOrder: [1, 0],
    })

    expect(normalized.availablePlayerIds).toEqual(["free-agent-id"])
  })
})
