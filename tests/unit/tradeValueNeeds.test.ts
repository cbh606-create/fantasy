import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { needsScore, teamNeedsAndSurplus } from "@/lib/trade/needs"
import { buildPlayerValueMap, playerValue } from "@/lib/trade/value"

const createPlayer = (
  id: string,
  projections: Record<CategoryId, number>,
): SeasonPlayer => ({
  id,
  name: id,
  projections,
  shooting: {
    FGM: projections.FG_PCT * 10,
    FGA: 10,
    FTM: projections.FT_PCT * 10,
    FTA: 10,
  },
})

const fillerProjections: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 7,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const scrub = createPlayer("scrub", {
  FG_PCT: 0.4,
  FT_PCT: 0.6,
  TPM: 0,
  REB: 2,
  AST: 1,
  STL: 4,
  BLK: 0,
  TO: 6,
  PTS: 8,
})

const star = createPlayer("star", {
  FG_PCT: 0.6,
  FT_PCT: 0.9,
  TPM: 5,
  REB: 12,
  AST: 15,
  STL: 3,
  BLK: 2,
  TO: 2,
  PTS: 30,
})

const fillerPlayers = Array.from({ length: 10 }, (_, index) =>
  createPlayer(`filler-${index + 2}`, { ...fillerProjections }),
)
const players = [scrub, star, ...fillerPlayers]

const state: SeasonLeagueState = {
  name: "Trade test league",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: players.map((player, teamIndex) => ({
    teamIndex,
    name: `Team ${teamIndex + 1}`,
    entries: [{ slot: "UTIL", playerId: player.id }],
  })),
  players,
  source: "manual",
}

describe("trade value and needs", () => {
  it("tags low-ranked categories as needs and high-ranked categories as surplus", () => {
    const analysis = analyzeSeasonLeague(state)
    const result = teamNeedsAndSurplus(analysis, 0)

    expect(result.need).toContain("AST")
    expect(result.surplus).toContain("STL")
  })

  it("assigns higher value to stronger projection profiles", () => {
    const values = buildPlayerValueMap(state)

    expect(values.get("star")).toBeGreaterThan(values.get("scrub")!)
  })

  it("treats lower turnovers as more valuable", () => {
    const lowTurnovers = createPlayer("low-turnovers", {
      ...fillerProjections,
      TO: 2,
    })
    const highTurnovers = createPlayer("high-turnovers", {
      ...fillerProjections,
      TO: 6,
    })
    const leaguePlayers = [lowTurnovers, highTurnovers]

    expect(playerValue(lowTurnovers, leaguePlayers)).toBeGreaterThan(
      playerValue(highTurnovers, leaguePlayers),
    )
  })

  it("averages inverse ranks for requested needs and scores an empty set as zero", () => {
    const analysis = analyzeSeasonLeague(state)

    expect(needsScore(analysis, 0, ["AST", "STL"])).toBe(6.5)
    expect(needsScore(analysis, 0, [])).toBe(0)
  })
})
