import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonTeamRoster,
} from "@/lib/season/types"
import { simulateTrade } from "@/lib/trade/simulateTrade"

const baseProjections: Record<CategoryId, number> = {
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

const createPlayer = (
  id: string,
  overrides: Partial<Record<CategoryId, number>> = {},
  projectedGames?: number,
): SeasonPlayer => {
  const projections = { ...baseProjections, ...overrides }

  return {
    id,
    name: id,
    ...(typeof projectedGames === "number" ? { projectedGames } : {}),
    projections,
    shooting: {
      FGM: projections.FG_PCT * 10,
      FGA: 10,
      FTM: projections.FT_PCT * 10,
      FTA: 10,
    },
  }
}

const leagueOf = (
  yourPlayers: SeasonPlayer[],
  theirPlayers: SeasonPlayer[],
): SeasonLeagueState => {
  const rosters = [yourPlayers, theirPlayers]
  const teams: SeasonTeamRoster[] = rosters.map((teamPlayers, teamIndex) => ({
    teamIndex,
    name: `Team ${teamIndex}`,
    entries: teamPlayers.map((player) => ({
      slot: "UTIL" as const,
      playerId: player.id,
    })),
  }))

  return {
    name: "Simulate trade league",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams,
    players: rosters.flat(),
    availablePlayerIds: [],
    waiverOrder: teams.map(({ teamIndex }) => teamIndex),
    source: "manual",
  }
}

describe("simulateTrade", () => {
  it("ranks and reports the per-game sum instead of the season total", () => {
    const state = leagueOf(
      [createPlayer("you-scorer", { PTS: 820 }, 41)],
      [createPlayer("them-scorer", { PTS: 820 }, 82)],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-scorer"],
      themPlayerIds: ["them-scorer"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    const points = result.you.categories.find((category) => category.categoryId === "PTS")

    expect(points!.beforeTotal).toBeCloseTo(20)
    expect(points!.rankBefore).toBe(1)
  })

  it("improves the category rank when the received total is higher", () => {
    const state = leagueOf(
      [
        createPlayer("you-star", { REB: 16, AST: 2 }),
        createPlayer("you-b", { REB: 16, AST: 2 }),
      ],
      [
        createPlayer("them-star", { REB: 2, AST: 16 }),
        createPlayer("them-b", { REB: 2, AST: 16 }),
      ],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-star"],
      themPlayerIds: ["them-star"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    const assists = result.you.categories.find((category) => category.categoryId === "AST")
    const fieldGoals = result.you.categories.find((category) => category.categoryId === "FG_PCT")

    expect(assists!.rankAfter).toBeLessThan(assists!.rankBefore)
    expect(fieldGoals!.rankAfter).toBe(fieldGoals!.rankBefore)
    expect(result.you.categories).toHaveLength(9)
    expect(result.ruleSentence).toBeUndefined()
    expect(state.teams[0].entries.map((entry) => entry.playerId)).toContain("you-star")
  })

  it("gives a better TO rank when the total falls", () => {
    const state = leagueOf(
      [createPlayer("you-to", { TO: 6 }), createPlayer("you-b", { TO: 6 })],
      [createPlayer("them-to", { TO: 1 }), createPlayer("them-b", { TO: 6 })],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-to"],
      themPlayerIds: ["them-to"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    const turnovers = result.you.categories.find((category) => category.categoryId === "TO")

    expect(turnovers!.afterTotal).toBeLessThan(turnovers!.beforeTotal)
    expect(turnovers!.rankAfter).toBeLessThan(turnovers!.rankBefore)
  })

  it("removes the chosen drop and keeps the lower-value teammate", () => {
    const state = leagueOf(
      [
        createPlayer("you-send", { PTS: 18 }),
        createPlayer("you-scrub", { PTS: 1 }),
        createPlayer("you-keep", { PTS: 30 }),
      ],
      [createPlayer("them-a", { PTS: 20 }), createPlayer("them-b", { PTS: 20 })],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-send"],
      themPlayerIds: ["them-a", "them-b"],
      yourDropPlayerId: "you-keep",
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.yourDroppedPlayerId).toBe("you-keep")
    expect(result.you.categories.find((category) => category.categoryId === "PTS")!.afterTotal)
      .toBeGreaterThan(0)
  })

  it("drops the other team's lowest-value remaining player", () => {
    const state = leagueOf(
      [createPlayer("you-a", { PTS: 20 }), createPlayer("you-b", { PTS: 20 })],
      [
        createPlayer("them-send", { PTS: 18 }),
        createPlayer("them-scrub", { PTS: 1 }),
        createPlayer("them-keep", { PTS: 30 }),
      ],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-a", "you-b"],
      themPlayerIds: ["them-send"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.theirDroppedPlayerId).toBe("them-scrub")
  })

  it("names your roster when the extra player has nowhere to go", () => {
    const state = leagueOf(
      [createPlayer("you-only", { PTS: 18 })],
      [createPlayer("them-a", { PTS: 20 }), createPlayer("them-b", { PTS: 20 })],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-only"],
      themPlayerIds: ["them-a", "them-b"],
    })

    expect(result).toEqual({
      status: "unfit",
      sentence: "Your roster cannot fit the extra player.",
    })
  })

  it("names their roster when the extra player has nowhere to go", () => {
    const state = leagueOf(
      [createPlayer("you-a", { PTS: 20 }), createPlayer("you-b", { PTS: 20 })],
      [createPlayer("them-only", { PTS: 18 })],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-a", "you-b"],
      themPlayerIds: ["them-only"],
    })

    expect(result).toEqual({
      status: "unfit",
      sentence: "Their roster cannot fit the extra player.",
    })
  })

  it("returns ranks and only the value sentence when the band and the match both fail", () => {
    const state = leagueOf(
      [createPlayer("you-star", { PTS: 40 }), createPlayer("you-b", { PTS: 10 })],
      [createPlayer("them-a", { PTS: 10 }), createPlayer("them-b", { PTS: 10 })],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-star"],
      themPlayerIds: ["them-a"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.you.overallBefore).toBeGreaterThan(0)
    expect(result.ruleSentence).toBe("Your package is more than 10% larger.")
  })

  it("names the missing match when the value band passes but no categories complement", () => {
    const state = leagueOf(
      [createPlayer("you-send", { PTS: 18 }), createPlayer("you-star", { PTS: 30 })],
      [createPlayer("them-recv", { PTS: 18 }), createPlayer("them-scrub", { PTS: 10 })],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-send"],
      themPlayerIds: ["them-recv"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.you.overallBefore).toBeGreaterThan(0)
    expect(result.ruleSentence).toBe("These teams do not have complementary categories.")
  })

  it("names the overpay ratio when the two-player side is below 1.2x", () => {
    const state = leagueOf(
      [createPlayer("you-a", { PTS: 1 }), createPlayer("you-b", { PTS: 1 })],
      [
        createPlayer("them-send", { PTS: 18 }),
        createPlayer("them-scrub", { PTS: 1 }),
        createPlayer("them-keep", { PTS: 30 }),
      ],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-a", "you-b"],
      themPlayerIds: ["them-send"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.you.overallBefore).toBeGreaterThan(0)
    expect(result.ruleSentence).toBe("The two-player side is below 1.2× the one-player side.")
  })

  it("names your matched weak category when it does not improve", () => {
    const state = leagueOf(
      [
        createPlayer("you-send", { REB: 6, AST: 4 }),
        createPlayer("you-keep", { REB: 10, AST: 2 }),
      ],
      [
        createPlayer("them-recv", { REB: 6, AST: 3.8 }),
        createPlayer("them-keep", { REB: 2, AST: 10 }),
      ],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-send"],
      themPlayerIds: ["them-recv"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.ruleSentence).toBe("None of your matched weak categories improve.")
  })

  it("names their strength when it ends on the bad side of the league mean", () => {
    const state = leagueOf(
      [
        createPlayer("you-send", { REB: 6, AST: 3.4 }),
        createPlayer("you-keep", { REB: 16, AST: 4 }),
      ],
      [
        createPlayer("them-recv", { REB: 2, AST: 3.6 }),
        createPlayer("them-keep", { REB: 2, AST: 4 }),
      ],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-send"],
      themPlayerIds: ["them-recv"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.ruleSentence)
      .toBe("One of their strengths finishes on the bad side of the league mean.")
  })

  it("returns no rule sentence for a mirrored complementary swap", () => {
    const state = leagueOf(
      [
        createPlayer("you-star", { REB: 16, AST: 2 }),
        createPlayer("you-b", { REB: 16, AST: 2 }),
      ],
      [
        createPlayer("them-star", { REB: 2, AST: 16 }),
        createPlayer("them-b", { REB: 2, AST: 16 }),
      ],
    )
    const result = simulateTrade(state, {
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-star"],
      themPlayerIds: ["them-star"],
    })

    expect(result?.status).toBe("ready")
    if (result?.status !== "ready") return
    expect(result.ruleSentence).toBeUndefined()
    expect(result.valueLine.length).toBeGreaterThan(0)
  })
})
