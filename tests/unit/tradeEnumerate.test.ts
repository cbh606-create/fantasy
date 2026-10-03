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
  const you = [
    player("scrub", { PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TPM: 0, TO: 9 }),
    ...Array.from({ length: 5 }, (_, index) =>
      player(`you-${index}`, { REB: 20, AST: 1 })),
  ]
  const them = [player("them-0", { REB: 1, AST: 20 })]
  const filler = [player("filler")]
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
        slot: "UTIL" as const,
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

    const packages = enumeratePackages(league)

    expect(
      packages.every((tradePackage) => tradePackage.counterpartyTeamIndex !== 1),
    ).toBe(true)
  })
})
