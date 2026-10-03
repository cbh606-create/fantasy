import type { CategoryId } from "@/lib/domain/types"
import {
  analyzeTeamTotals,
  type SeasonAnalysis,
  type TeamCategoryTotals,
} from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import {
  assessSide,
  categoriesMovedGood,
  type CategoryTotalMove,
} from "./accept"
import { classifyTeam, leagueMeans, matchedWeaks } from "./classify"
import { enumeratePackages } from "./enumerate"
import {
  evenValueGap,
  offerSortScore,
  passesShapeRules,
  replacementScaledValues,
} from "./score"
import {
  applyTradePackage,
  createTradeAnalysisContext,
  totalsAfterTrade,
} from "./simulate"
import type {
  SuggestTradesOptions,
  TradePackage,
  TradeSuggestion,
} from "./types"
import { buildPlayerValueMap } from "./value"

const packageId = (tradePackage: TradePackage) =>
  [
    tradePackage.shape,
    tradePackage.counterpartyTeamIndex,
    [...tradePackage.youPlayerIds].sort().join("+"),
    [...tradePackage.themPlayerIds].sort().join("+"),
  ].join("|")

const totalsFor = (totalsByTeam: TeamCategoryTotals[], teamIndex: number) =>
  totalsByTeam.find((team) => team.teamIndex === teamIndex)!.totals

const categoryZ = (
  analysis: SeasonAnalysis,
  teamIndex: number,
  categoryId: CategoryId,
) =>
  analysis.byTeam
    .find((team) => team.teamIndex === teamIndex)
    ?.levels.find((level) => level.categoryId === categoryId)?.z ?? 0

const gainedZ = (
  gains: CategoryTotalMove[],
  before: SeasonAnalysis,
  after: SeasonAnalysis,
  teamIndex: number,
) =>
  gains.reduce(
    (sum, { categoryId }) =>
      sum
      + categoryZ(after, teamIndex, categoryId)
      - categoryZ(before, teamIndex, categoryId),
    0,
  )

export const suggestTrades = (
  state: SeasonLeagueState,
  options: SuggestTradesOptions = {},
): {
  suggestions: TradeSuggestion[]
  youWeak: CategoryId[]
  youStrong: CategoryId[]
} => {
  const excludedPlayerIds = options.excludedPlayerIds ?? []
  const targetCategoryIds = options.targetCategoryIds ?? []
  const context = createTradeAnalysisContext(state)
  const beforeMean = leagueMeans(context.totalsByTeam)
  const yourSides = classifyTeam(
    context.totalsByTeam,
    state.perspectiveTeamIndex,
  )
  const values = replacementScaledValues(buildPlayerValueMap(state))
  const theirSidesByTeamIndex = new Map<number, typeof yourSides>()
  const theirSidesFor = (teamIndex: number) => {
    const cached = theirSidesByTeamIndex.get(teamIndex)

    if (cached) {
      return cached
    }

    const sides = classifyTeam(context.totalsByTeam, teamIndex)
    theirSidesByTeamIndex.set(teamIndex, sides)

    return sides
  }

  // Shape rules run before the simulation because they are pure arithmetic on
  // player values, while every simulated package re-totals the two teams.
  const suggestions = enumeratePackages(
    state,
    context.totalsByTeam,
    excludedPlayerIds,
  ).flatMap(
    (tradePackage): TradeSuggestion[] => {
      const { ok, overpayRatio } = passesShapeRules(tradePackage, values)

      if (!ok) {
        return []
      }

      const theirTeamIndex = tradePackage.counterpartyTeamIndex
      const theirSides = theirSidesFor(theirTeamIndex)
      const application = applyTradePackage(
        state,
        tradePackage,
        context.values,
        excludedPlayerIds,
      )

      if (application.rejected) {
        return []
      }

      const afterTotals = totalsAfterTrade(
        application.state,
        tradePackage,
        context,
      )
      const afterMean = leagueMeans(afterTotals)
      const afterAnalysis = analyzeTeamTotals(afterTotals)
      const youAssessment = assessSide({
        before: totalsFor(context.totalsByTeam, state.perspectiveTeamIndex),
        after: totalsFor(afterTotals, state.perspectiveTeamIndex),
        beforeMean,
        afterMean,
        weak: yourSides.weak,
        strong: yourSides.strong,
        matchedWeak: matchedWeaks(yourSides, theirSides),
      })
      const themAssessment = assessSide({
        before: totalsFor(context.totalsByTeam, theirTeamIndex),
        after: totalsFor(afterTotals, theirTeamIndex),
        beforeMean,
        afterMean,
        weak: theirSides.weak,
        strong: theirSides.strong,
        matchedWeak: matchedWeaks(theirSides, yourSides),
      })

      if (
        !youAssessment.improved
        || !youAssessment.strengthsIntact
        || !themAssessment.improved
        || !themAssessment.strengthsIntact
      ) {
        return []
      }

      const youImproved = categoriesMovedGood(
        totalsFor(context.totalsByTeam, state.perspectiveTeamIndex),
        totalsFor(afterTotals, state.perspectiveTeamIndex),
      )

      if (
        targetCategoryIds.length > 0
        && !youImproved.some((move) => targetCategoryIds.includes(move.categoryId))
      ) {
        return []
      }

      return [{
        id: packageId(tradePackage),
        shape: tradePackage.shape,
        counterpartyTeamIndex: theirTeamIndex,
        givePlayerIds: tradePackage.youPlayerIds,
        getPlayerIds: tradePackage.themPlayerIds,
        reasons: [
          `Gains ${themAssessment.gains
            .map(({ categoryId }) => CATEGORY_SHORT_LABELS[categoryId])
            .join(", ")}`,
          overpayRatio === undefined
            ? `balanced ${tradePackage.shape}`
            : `${tradePackage.shape} overpay`,
        ],
        mutualScore: offerSortScore(
          gainedZ(
            youAssessment.gains,
            context.before,
            afterAnalysis,
            state.perspectiveTeamIndex,
          ),
          gainedZ(
            themAssessment.gains,
            context.before,
            afterAnalysis,
            theirTeamIndex,
          ),
        ),
        ...(overpayRatio === undefined
          ? { valueGap: evenValueGap(tradePackage, values) }
          : { overpayRatio }),
        ...(application.droppedPlayerId
          ? { droppedPlayerId: application.droppedPlayerId }
          : {}),
        youGains: youAssessment.gains,
        youImproved,
        themGains: themAssessment.gains,
        youWorsened: youAssessment.worsened,
        themWorsened: themAssessment.worsened,
        youStrengthsHeld: youAssessment.strengthsHeld,
        themStrengthsHeld: themAssessment.strengthsHeld,
      }]
    },
  )

  return {
    suggestions: suggestions.sort(
      (left, right) =>
        right.mutualScore - left.mutualScore
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    ),
    youWeak: yourSides.weak,
    youStrong: yourSides.strong,
  }
}
