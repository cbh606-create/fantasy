import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState } from "@/lib/season/types"
import { MAX_SUGGESTIONS } from "./constants"
import { enumeratePackages } from "./enumerate"
import { teamNeedsAndSurplus } from "./needs"
import { mutualScore, passesShapeRules, replacementScaledValues } from "./score"
import { createTradeAnalysisContext, evaluateTrade } from "./simulate"
import type { TradePackage, TradeSuggestion } from "./types"
import { buildPlayerValueMap } from "./value"

type TeamProfile = { need: CategoryId[]; surplus: CategoryId[] }

const packageId = (tradePackage: TradePackage) =>
  [
    tradePackage.shape,
    tradePackage.counterpartyTeamIndex,
    [...tradePackage.youPlayerIds].sort().join("+"),
    [...tradePackage.themPlayerIds].sort().join("+"),
  ].join("|")

const buildReasons = (
  tradePackage: TradePackage,
  yourProfile: TeamProfile,
  theirProfile: TeamProfile,
  overpayRatio: number | undefined,
): string[] => {
  const youGain = yourProfile.need.filter((categoryId) =>
    theirProfile.surplus.includes(categoryId))
  const themGain = theirProfile.need.filter((categoryId) =>
    yourProfile.surplus.includes(categoryId))
  const shapeNote = overpayRatio === undefined
    ? `balanced ${tradePackage.shape}`
    : `${tradePackage.shape} overpay`

  return [
    ...(youGain.length > 0 ? [`Targets your need: ${youGain.join(", ")}`] : []),
    ...(themGain.length > 0
      ? [`Sends their need: ${themGain.join(", ")}`]
      : []),
    shapeNote,
  ]
}

export const suggestTrades = (
  state: SeasonLeagueState,
): {
  suggestions: TradeSuggestion[]
  youNeeds: CategoryId[]
  youSurplus: CategoryId[]
} => {
  const context = createTradeAnalysisContext(state)
  const analysis = context.before
  const yourProfile = teamNeedsAndSurplus(analysis, state.perspectiveTeamIndex)
  const values = replacementScaledValues(buildPlayerValueMap(state))
  const profileByTeamIndex = new Map<number, TeamProfile>()
  const profileFor = (teamIndex: number) => {
    const cached = profileByTeamIndex.get(teamIndex)

    if (cached) {
      return cached
    }

    const profile = teamNeedsAndSurplus(analysis, teamIndex)
    profileByTeamIndex.set(teamIndex, profile)

    return profile
  }

  // Shape rules run before the simulation because they are pure arithmetic on
  // player values, while every evaluateTrade call re-analyzes the league.
  const suggestions = enumeratePackages(state, analysis).flatMap(
    (tradePackage): TradeSuggestion[] => {
      const { ok, overpayRatio } = passesShapeRules(tradePackage, values)

      if (!ok) {
        return []
      }

      const impact = evaluateTrade(state, tradePackage, context)

      if (!impact) {
        return []
      }

      const score = mutualScore(
        impact.you.needsScoreAfter - impact.you.needsScoreBefore,
        impact.them.needsScoreAfter - impact.them.needsScoreBefore,
      )

      if (score <= 0) {
        return []
      }

      return [{
        id: packageId(tradePackage),
        shape: tradePackage.shape,
        counterpartyTeamIndex: tradePackage.counterpartyTeamIndex,
        givePlayerIds: tradePackage.youPlayerIds,
        getPlayerIds: tradePackage.themPlayerIds,
        reasons: buildReasons(
          tradePackage,
          yourProfile,
          profileFor(tradePackage.counterpartyTeamIndex),
          overpayRatio,
        ),
        mutualScore: score,
        ...(overpayRatio === undefined ? {} : { overpayRatio }),
        ...(impact.droppedPlayerId
          ? { droppedPlayerId: impact.droppedPlayerId }
          : {}),
        you: impact.you,
        them: impact.them,
      }]
    },
  )

  return {
    suggestions: suggestions
      .sort((left, right) => right.mutualScore - left.mutualScore)
      .slice(0, MAX_SUGGESTIONS),
    youNeeds: yourProfile.need,
    youSurplus: yourProfile.surplus,
  }
}
