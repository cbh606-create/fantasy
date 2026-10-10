import { describe, expect, it } from "vitest"
import { pickPreferringNewerSeason } from "@/lib/adapters/espnSeason"
import type { SeasonLeagueState } from "@/lib/season/types"

const baseState = (season: number, rostered: number): SeasonLeagueState => ({
  id: "league",
  name: "Test",
  season,
  source: "espn",
  perspectiveTeamIndex: 0,
  espnTeamId: 1,
  rosterSlots: ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BE", "IL"],
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: Array.from({ length: rostered }, (_, index) => ({
        slot: "UTIL" as const,
        playerId: `p${index}`,
      })),
    },
  ],
  players: Array.from({ length: rostered }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    team: "TST",
    positions: ["G"],
    injuryStatus: "ACTIVE" as const,
    projected: {
      FGM: 0,
      FGA: 0,
      FTM: 0,
      FTA: 0,
      TPM: 0,
      REB: 0,
      AST: 0,
      STL: 0,
      BLK: 0,
      TO: 0,
      PTS: 0,
    },
  })),
  availablePlayerIds: [],
})

describe("pickPreferringNewerSeason", () => {
  it("keeps the stored season when season+1 has an empty roster", () => {
    const result = pickPreferringNewerSeason(
      baseState(2026, 13),
      baseState(2027, 0),
    )
    expect(result.season).toBe(2026)
  })

  it("bumps to season+1 when that year already has a drafted roster", () => {
    const result = pickPreferringNewerSeason(
      baseState(2026, 13),
      baseState(2027, 13),
    )
    expect(result.season).toBe(2027)
  })

  it("keeps the stored season when season+1 is unavailable", () => {
    const result = pickPreferringNewerSeason(baseState(2026, 13), null)
    expect(result.season).toBe(2026)
  })
})
