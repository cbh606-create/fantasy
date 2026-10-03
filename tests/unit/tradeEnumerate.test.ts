import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { enumeratePackages } from "@/lib/trade/enumerate"

const base: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 8,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const player = (
  id: string,
  overrides: Partial<Record<CategoryId, number>> = {},
): SeasonPlayer => {
  const projections = { ...base, ...overrides }

  return {
    id,
    name: id,
    projections,
    shooting: {
      FGM: projections.FG_PCT * 10,
      FGA: 10,
      FTM: projections.FT_PCT * 10,
      FTA: 10,
    },
  }
}

const state = (): SeasonLeagueState => {
  const specialist = { REB: 20, AST: 1 }
  const you = [
    player("scrub", specialist),
    ...Array.from({ length: 5 }, (_, index) =>
      player(`you-${index}`, specialist)),
  ]
  const them = [
    player("them-0", { REB: 1, AST: 20 }),
    ...Array.from({ length: 5 }, (_, index) =>
      player(`them-il-${index}`, specialist)),
  ]
  const filler = Array.from({ length: 6 }, (_, index) =>
    player(`filler-${index}`, specialist))
  const rosters = [you, them, ...Array.from({ length: 10 }, () => filler)]

  return {
    name: "Enumerate",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: rosters.map((teamPlayers, teamIndex) => ({
      teamIndex,
      name: `Team ${teamIndex}`,
      entries: teamPlayers.map((rosterPlayer) => ({
        slot: teamIndex === 1 && rosterPlayer.id !== "them-0" ? "IL" as const : "UTIL" as const,
        playerId: rosterPlayer.id,
      })),
    })),
    players: rosters.flat(),
    availablePlayerIds: [],
    waiverOrder: rosters.map((_, teamIndex) => teamIndex),
    source: "manual",
  }
}

describe("enumeratePackages", () => {
  it("includes the lowest-value non-IL player", () => {
    const packages = enumeratePackages(state())
    const oneForOnes = packages.filter((tradePackage) => tradePackage.shape === "1:1")

    expect(oneForOnes).toHaveLength(6)
    expect(oneForOnes.some((tradePackage) =>
      tradePackage.youPlayerIds.includes("scrub"),
    )).toBe(true)
  })

  it("skips a team that is weak and strong in the same categories", () => {
    const league = state()
    league.players = league.players.map((rosterPlayer) =>
      rosterPlayer.id === "them-0"
        ? { ...rosterPlayer, projections: { ...base, REB: 20, AST: 1 } }
        : rosterPlayer,
    )

    expect(enumeratePackages(league)).toHaveLength(0)
  })
})
