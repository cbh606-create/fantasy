import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonTeamRoster,
} from "@/lib/season/types"
import { OVERPAY_RATIO } from "@/lib/trade/constants"
import { enumeratePackages } from "@/lib/trade/enumerate"
import { passesShapeRules, replacementScaledValues } from "@/lib/trade/score"
import { evaluateTrade } from "@/lib/trade/simulate"
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
): SeasonLeagueState => {
  const rosters = [
    yourPlayers,
    theirPlayers,
    ...Array.from({ length: 10 }, (_, index) =>
      baselinePlayers(`filler${index}-base`, 4)),
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
    source: "manual",
  }
}

// YOU are elite in REB and last in AST; TARGET is the exact mirror, and the two
// swap pieces are mirrored too so their values match to the decimal.
const mirrorState = buildLeague(
  [
    createPlayer("you-star", { REB: 16, AST: 2 }),
    ...baselinePlayers("you-base", 3),
  ],
  [
    createPlayer("them-star", { REB: 2, AST: 16 }),
    ...baselinePlayers("them-base", 3),
  ],
  ["you-base-3"],
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
  it("returns a 1:1 win-win when needs complement", () => {
    const { suggestions, youNeeds, youSurplus } = suggestTrades(mirrorState)
    const suggestion = findSuggestion(suggestions, ["you-star"], ["them-star"])

    expect(youNeeds).toContain("AST")
    expect(youSurplus).toContain("REB")
    expect(suggestion).toBeDefined()
    expect(suggestion!.shape).toBe("1:1")
    expect(suggestion!.counterpartyTeamIndex).toBe(1)
    expect(suggestion!.overpayRatio).toBeUndefined()
    expect(suggestion!.you.needsScoreAfter).toBeGreaterThan(
      suggestion!.you.needsScoreBefore,
    )
    expect(suggestion!.them.needsScoreAfter).toBeGreaterThan(
      suggestion!.them.needsScoreBefore,
    )
    expect(suggestion!.reasons.join(" ")).toContain("balanced 1:1")
  })

  it("rejects a 2:1 without overpay", () => {
    const tradePackage: TradePackage = {
      shape: "2:1",
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-rebounder-1", "you-rebounder-2"],
      themPlayerIds: ["them-ace"],
    }
    const impact = evaluateTrade(starState, tradePackage)
    const shapeCheck = shapeCheckFor(starState, tradePackage)
    const { suggestions } = suggestTrades(starState)

    // The deal is a genuine win-win, so only the overpay rule can reject it.
    expect(impact!.you.needsScoreAfter).toBeGreaterThan(
      impact!.you.needsScoreBefore,
    )
    expect(impact!.them.needsScoreAfter).toBeGreaterThan(
      impact!.them.needsScoreBefore,
    )
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

  it("accepts a 2:1 with overpay and mutual needs improvement", () => {
    const { suggestions } = suggestTrades(mirrorState)
    const suggestion = findSuggestion(
      suggestions,
      ["you-star", "you-base-1"],
      ["them-star"],
    )

    expect(suggestion).toBeDefined()
    expect(suggestion!.shape).toBe("2:1")
    expect(suggestion!.overpayRatio).toBeGreaterThanOrEqual(OVERPAY_RATIO)
    expect(suggestion!.you.needsScoreAfter).toBeGreaterThan(
      suggestion!.you.needsScoreBefore,
    )
    expect(suggestion!.them.needsScoreAfter).toBeGreaterThan(
      suggestion!.them.needsScoreBefore,
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
    const impact = evaluateTrade(starState, tradePackage)
    const shapeCheck = shapeCheckFor(starState, tradePackage)
    const { suggestions } = suggestTrades(starState)

    expect(impact!.you.needsScoreAfter).toBeGreaterThan(
      impact!.you.needsScoreBefore,
    )
    expect(impact!.them.needsScoreAfter).toBeGreaterThan(
      impact!.them.needsScoreBefore,
    )
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

  it("never offers IL players", () => {
    const packages = enumeratePackages(
      mirrorState,
      analyzeSeasonLeague(mirrorState),
    )
    const { suggestions } = suggestTrades(mirrorState)

    expect(packages.length).toBeGreaterThan(0)
    expect(
      packages.every(({ youPlayerIds }) => !youPlayerIds.includes("you-base-3")),
    ).toBe(true)
    expect(
      suggestions.every(
        ({ givePlayerIds }) => !givePlayerIds.includes("you-base-3"),
      ),
    ).toBe(true)
  })
})
