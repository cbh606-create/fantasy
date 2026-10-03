import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonTeamRoster,
} from "@/lib/season/types"
import { OVERPAY_RATIO } from "@/lib/trade/constants"
import { enumeratePackages } from "@/lib/trade/enumerate"
import {
  offerSortScore,
  passesShapeRules,
  replacementScaledValues,
} from "@/lib/trade/score"
import { suggestTrades } from "@/lib/trade/suggest"
import type { TradePackage, TradeSuggestion } from "@/lib/trade/types"
import { buildPlayerValueMap } from "@/lib/trade/value"

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
): SeasonPlayer => {
  const projections = { ...baseProjections, ...overrides }

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

const baselinePlayers = (prefix: string, count: number): SeasonPlayer[] =>
  Array.from({ length: count }, (_, index) =>
    createPlayer(`${prefix}-${index + 1}`))

// 12 teams keeps NEED_RANK_FLOOR=9 / SURPLUS_RANK_CEILING=4 meaningful; the ten
// filler teams are identical so their rank profile is uniformly high or low,
// which leaves TARGET (team 1) as the only complementary counterparty.
const buildLeague = (
  yourPlayers: SeasonPlayer[],
  theirPlayers: SeasonPlayer[],
  ilPlayerIds: string[] = [],
  fillerSize = 4,
): SeasonLeagueState => {
  const rosters = [
    yourPlayers,
    theirPlayers,
    ...Array.from({ length: 10 }, (_, index) =>
      baselinePlayers(`filler${index}-base`, fillerSize)),
  ]
  const teams: SeasonTeamRoster[] = rosters.map((teamPlayers, teamIndex) => ({
    teamIndex,
    name: `Team ${teamIndex}`,
    entries: [
      ...teamPlayers.map((player) => ({
        slot: ilPlayerIds.includes(player.id) ? ("IL" as const) : ("UTIL" as const),
        playerId: player.id,
      })),
      { slot: "BE" as const, playerId: null },
    ],
  }))

  return {
    name: "Trade suggest league",
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

// YOU are elite in REB and last in AST; TARGET is the exact mirror, and the two
// swap pieces are mirrored too so their values match to the decimal.
const youStarStats = { REB: 16, AST: 2 }
const themStarStats = { REB: 2, AST: 16 }
const mirrorState = buildLeague(
  [
    createPlayer("you-star", youStarStats),
    createPlayer("you-b", youStarStats),
    createPlayer("you-c", youStarStats),
    createPlayer("you-d", youStarStats),
    createPlayer("you-e", youStarStats),
    createPlayer("you-il"),
  ],
  [
    createPlayer("them-star", themStarStats),
    createPlayer("them-b", themStarStats),
    createPlayer("them-c", themStarStats),
    createPlayer("them-d", themStarStats),
    createPlayer("them-e", themStarStats),
    createPlayer("them-il"),
  ],
  ["you-il", "them-il"],
  6,
)

// Same mirror, but both teams are also weak in STL and YOU's star steals a hair
// more than the rest, so the AST/REB swap still costs YOU a weak STL total.
const stealStarStats = { REB: 16, AST: 2, STL: 1.1 }
const stealRoleStats = { REB: 16, AST: 2, STL: 1 }
const worsenedState = buildLeague(
  [
    createPlayer("you-star", stealStarStats),
    createPlayer("you-b", stealRoleStats),
    createPlayer("you-c", stealRoleStats),
    createPlayer("you-d", stealRoleStats),
    createPlayer("you-e", stealRoleStats),
  ],
  [
    createPlayer("them-star", { REB: 2, AST: 16, STL: 1 }),
    createPlayer("them-b", { REB: 2, AST: 16, STL: 1 }),
    createPlayer("them-c", { REB: 2, AST: 16, STL: 1 }),
    createPlayer("them-d", { REB: 2, AST: 16, STL: 1 }),
    createPlayer("them-e", { REB: 2, AST: 16, STL: 1 }),
  ],
  [],
  6,
)

// YOU own two replacement-level rebounders, TARGET owns one dominant passer.
// Trading both rebounders for the ace helps both teams but is not an overpay.
const starState = buildLeague(
  [
    createPlayer("you-rebounder-1", {
      REB: 14,
      AST: 4,
      PTS: 6,
      TO: 8,
      TPM: 0,
      STL: 1,
      BLK: 0,
      FG_PCT: 0.42,
      FT_PCT: 0.6,
    }),
    createPlayer("you-rebounder-2", {
      REB: 14,
      AST: 4,
      PTS: 6,
      TO: 8,
      TPM: 0,
      STL: 1,
      BLK: 0,
      FG_PCT: 0.42,
      FT_PCT: 0.6,
    }),
    ...baselinePlayers("you-base", 2),
  ],
  [
    createPlayer("them-ace", {
      REB: 2,
      AST: 30,
      PTS: 30,
      TPM: 4,
      FG_PCT: 0.55,
      FT_PCT: 0.85,
    }),
    ...baselinePlayers("them-base", 3),
  ],
)

const sortedKey = (playerIds: string[]) => [...playerIds].sort().join("+")

const findSuggestion = (
  suggestions: TradeSuggestion[],
  givePlayerIds: string[],
  getPlayerIds: string[],
) =>
  suggestions.find(
    (suggestion) =>
      sortedKey(suggestion.givePlayerIds) === sortedKey(givePlayerIds)
      && sortedKey(suggestion.getPlayerIds) === sortedKey(getPlayerIds),
  )

const shapeCheckFor = (state: SeasonLeagueState, tradePackage: TradePackage) =>
  passesShapeRules(
    tradePackage,
    replacementScaledValues(buildPlayerValueMap(state)),
  )

describe("replacementScaledValues", () => {
  it("keeps every scaled value and ratio independent of the worst player", () => {
    const values = new Map([["good", 2], ["average", 0]])
    const scaled = replacementScaledValues(values)
    const scaledWithScrub = replacementScaledValues(
      new Map([...values, ["scrub", -8]]),
    )
    const ratio = (pool: Map<string, number>) =>
      pool.get("good")! / pool.get("average")!

    expect(scaledWithScrub.get("good")).toBe(scaled.get("good"))
    expect(scaledWithScrub.get("scrub")).toBeGreaterThan(0)
    expect(ratio(scaledWithScrub)).toBe(ratio(scaled))
  })
})

describe("suggestTrades", () => {
  it("returns the mirrored 1:1 and does not slice at 20", () => {
    const { suggestions, youWeak, youStrong } = suggestTrades(mirrorState)
    const suggestion = findSuggestion(suggestions, ["you-star"], ["them-star"])

    expect(youWeak).toContain("AST")
    expect(youStrong).toContain("REB")
    expect(suggestion).toBeDefined()
    expect(suggestion!.shape).toBe("1:1")
    expect(suggestion!.counterpartyTeamIndex).toBe(1)
    expect(suggestion!.youGains.map((gain) => gain.categoryId)).toContain("AST")
    expect(suggestion!.themGains.map((gain) => gain.categoryId)).toContain("REB")
    expect(suggestion!.youWorsened).toEqual([])
    expect(suggestion!.valueGap).toBeLessThanOrEqual(0.25)
    expect(suggestion!.overpayRatio).toBeUndefined()
    expect(suggestion!.reasons[0]).toContain("REB")
    expect(suggestion!.reasons.join(" ")).toContain("balanced 1:1")
    expect(suggestion).not.toHaveProperty("you")
    expect(suggestion).not.toHaveProperty("them")
    expect(suggestions.length).toBeGreaterThan(20)
  })

  it("orders suggestions by mutualScore descending, then id ascending", () => {
    const { suggestions } = suggestTrades(mirrorState)
    const ids = suggestions.map(({ id }) => id)
    const tiedPairs = suggestions.slice(1).filter(
      ({ mutualScore }, index) => mutualScore === suggestions[index].mutualScore,
    )

    expect(suggestions.length).toBeGreaterThan(1)
    expect(tiedPairs.length).toBeGreaterThan(0)
    suggestions.slice(1).forEach((suggestion, index) => {
      const previous = suggestions[index]

      expect(previous.mutualScore).toBeGreaterThanOrEqual(suggestion.mutualScore)

      if (previous.mutualScore !== suggestion.mutualScore) {
        return
      }

      expect(previous.id < suggestion.id).toBe(true)
    })
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps a package that worsens a weak category and reports it", () => {
    const { suggestions, youWeak } = suggestTrades(worsenedState)
    const suggestion = findSuggestion(suggestions, ["you-star"], ["them-star"])

    expect(youWeak).toContain("STL")
    expect(suggestion).toBeDefined()
    expect(suggestion!.youGains.map(({ categoryId }) => categoryId)).toContain("AST")
    expect(suggestion!.youWorsened.map(({ categoryId }) => categoryId)).toContain("STL")
  })

  it("ranks a positive harmonic mean ahead of a residual sum", () => {
    expect(offerSortScore(2, 2)).toBe(2)
    expect(offerSortScore(4, -1)).toBeLessThan(0)
    expect(offerSortScore(2, 2)).toBeGreaterThan(offerSortScore(4, -1))
  })

  it("rejects a 2:1 without overpay", () => {
    const tradePackage: TradePackage = {
      shape: "2:1",
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-rebounder-1", "you-rebounder-2"],
      themPlayerIds: ["them-ace"],
    }
    const shapeCheck = shapeCheckFor(starState, tradePackage)
    const { suggestions } = suggestTrades(starState)

    expect(shapeCheck.ok).toBe(false)
    expect(shapeCheck.overpayRatio).toBeLessThan(OVERPAY_RATIO)
    expect(
      findSuggestion(
        suggestions,
        tradePackage.youPlayerIds,
        tradePackage.themPlayerIds,
      ),
    ).toBeUndefined()
  })

  it("accepts a 2:1 with overpay and mutual category gains", () => {
    const { suggestions } = suggestTrades(mirrorState)
    const suggestion = findSuggestion(
      suggestions,
      ["you-star", "you-b"],
      ["them-star"],
    )

    expect(suggestion).toBeDefined()
    expect(suggestion!.shape).toBe("2:1")
    expect(suggestion!.overpayRatio).toBeGreaterThanOrEqual(OVERPAY_RATIO)
    expect(suggestion!.valueGap).toBeUndefined()
    expect(suggestion!.youGains.length).toBeGreaterThan(0)
    expect(suggestion!.themGains.length).toBeGreaterThan(0)
    expect(suggestion!.reasons[0]).toContain(
      CATEGORY_SHORT_LABELS[suggestion!.themGains[0].categoryId],
    )
    expect(suggestion!.reasons.join(" ")).toContain("2:1 overpay")
  })

  it("rejects a 2:2 outside the fairness band", () => {
    const tradePackage: TradePackage = {
      shape: "2:2",
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-rebounder-1", "you-rebounder-2"],
      themPlayerIds: ["them-ace", "them-base-1"],
    }
    const shapeCheck = shapeCheckFor(starState, tradePackage)
    const { suggestions } = suggestTrades(starState)

    expect(shapeCheck.ok).toBe(false)
    expect(shapeCheck.overpayRatio).toBeUndefined()
    expect(
      findSuggestion(
        suggestions,
        tradePackage.youPlayerIds,
        tradePackage.themPlayerIds,
      ),
    ).toBeUndefined()
  })

  it("returns a package when the requested category rises outside the matched weaks", () => {
    const league = buildLeague(
      [
        createPlayer("you-star", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
        createPlayer("you-b", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
        createPlayer("you-c", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
        createPlayer("you-d", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
        createPlayer("you-e", { REB: 16, AST: 2, PTS: 20, TPM: 6 }),
      ],
      [
        createPlayer("them-star", { REB: 2, AST: 16, PTS: 30, TPM: 0 }),
        createPlayer("them-b", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
        createPlayer("them-c", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
        createPlayer("them-d", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
        createPlayer("them-e", { REB: 2, AST: 16, PTS: 10, TPM: 0 }),
      ],
      [],
      6,
    )
    const { suggestions } = suggestTrades(league, { targetCategoryIds: ["PTS"] })
    const suggestion = findSuggestion(suggestions, ["you-star"], ["them-star"])

    expect(suggestion).toBeDefined()
    expect(suggestion!.youGains.map((gain) => gain.categoryId)).not.toContain("PTS")
    expect(suggestion!.youImproved.map((move) => move.categoryId)).toContain("PTS")
    expect(suggestion!.reasons[0]).toContain("3PM")
    expect(suggestion!.reasons[0]).not.toContain("TPM")
  })

  it("omits a package that raises none of the requested categories", () => {
    const { suggestions } = suggestTrades(mirrorState, {
      targetCategoryIds: ["TPM"],
    })

    expect(
      findSuggestion(suggestions, ["you-star"], ["them-star"]),
    ).toBeUndefined()
  })

  it("omits a package that would send an excluded player", () => {
    const { suggestions } = suggestTrades(mirrorState, {
      targetCategoryIds: ["AST"],
      excludedPlayerIds: ["you-star"],
    })

    expect(
      suggestions.some((suggestion) =>
        suggestion.givePlayerIds.includes("you-star")),
    ).toBe(false)
  })

  it("never offers IL players", () => {
    const packages = enumeratePackages(mirrorState)
    const { suggestions } = suggestTrades(mirrorState)

    expect(packages.length).toBeGreaterThan(0)
    expect(
      packages.every(({ youPlayerIds }) => !youPlayerIds.includes("you-il")),
    ).toBe(true)
    expect(
      suggestions.every(
        ({ givePlayerIds }) => !givePlayerIds.includes("you-il"),
      ),
    ).toBe(true)
  })
})
