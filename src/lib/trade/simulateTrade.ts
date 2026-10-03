import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import {
  analyzeTeamTotals,
  type SeasonAnalysis,
  type TeamCategoryTotals,
} from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { assessSide } from "./accept"
import { classifyTeam, leagueMeans, matchedWeaks, teamsMatch } from "./classify"
import { formatValueLine } from "./offerCopy"
import { overallPlaces } from "./overallPlace"
import {
  evenValueGap,
  passesShapeRules,
  replacementScaledValues,
} from "./score"
import {
  applyTradePackage,
  createTradeAnalysisContext,
  totalsAfterTrade,
} from "./simulate"
import type { TradePackage, TradeShape } from "./types"
import { buildPlayerValueMap } from "./value"

export type SimulateTradeInput = {
  counterpartyTeamIndex: number
  youPlayerIds: string[]
  themPlayerIds: string[]
  yourDropPlayerId?: string
}

export type CategoryRankMove = {
  categoryId: CategoryId
  beforeTotal: number
  afterTotal: number
  rankBefore: number
  rankAfter: number
}

export type SideRankReport = {
  overallBefore: number
  overallAfter: number
  rankSumBefore: number
  rankSumAfter: number
  categories: CategoryRankMove[]
}

export type TradeSimulationResult =
  | {
    status: "unfit"
    sentence:
      | "Your roster cannot fit the extra player."
      | "Their roster cannot fit the extra player."
  }
  | {
    status: "ready"
    you: SideRankReport
    them: SideRankReport
    valueLine: string
    yourDroppedPlayerId?: string
    theirDroppedPlayerId?: string
    ruleSentence?: string
  }

const shapeFor = (youCount: number, themCount: number): TradeShape =>
  `${youCount}:${themCount}` as TradeShape

const idsOnTeam = (state: SeasonLeagueState, teamIndex: number): Set<string> =>
  new Set(
    state.teams
      .find((team) => team.teamIndex === teamIndex)
      ?.entries.flatMap((entry) => (entry.playerId ? [entry.playerId] : [])),
  )

const ranksFor = (
  analysis: SeasonAnalysis,
  teamIndex: number,
): Record<CategoryId, number> =>
  Object.fromEntries(
    analysis.byCategory.map((category) => [
      category.categoryId,
      category.rows.find((row) => row.teamIndex === teamIndex)?.rank ?? 0,
    ]),
  ) as Record<CategoryId, number>

const packageTotal = (playerIds: string[], values: Map<string, number>) =>
  playerIds.reduce((sum, playerId) => sum + (values.get(playerId) ?? 0), 0)

const ruleFields = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  beforeTotals: TeamCategoryTotals[],
  afterTotals: TeamCategoryTotals[],
  values: Map<string, number>,
  shapeOk: boolean,
): { ruleSentence?: string } => {
  const giveTotal = packageTotal(tradePackage.youPlayerIds, values)
  const getTotal = packageTotal(tradePackage.themPlayerIds, values)
  const even = tradePackage.youPlayerIds.length === tradePackage.themPlayerIds.length

  if (!shapeOk && even) {
    return {
      ruleSentence: giveTotal > getTotal
        ? "Your package is more than 10% larger."
        : "Their package is more than 10% larger.",
    }
  }

  if (!shapeOk) {
    return { ruleSentence: "The two-player side is below 1.2× the one-player side." }
  }

  const yourSides = classifyTeam(beforeTotals, state.perspectiveTeamIndex)
  const theirSides = classifyTeam(beforeTotals, tradePackage.counterpartyTeamIndex)

  if (!teamsMatch(yourSides, theirSides)) {
    return { ruleSentence: "These teams do not have complementary categories." }
  }

  const beforeMean = leagueMeans(beforeTotals)
  const afterMean = leagueMeans(afterTotals)
  const totalsFor = (totals: TeamCategoryTotals[], teamIndex: number) =>
    totals.find((team) => team.teamIndex === teamIndex)!.totals
  const youAssessment = assessSide({
    before: totalsFor(beforeTotals, state.perspectiveTeamIndex),
    after: totalsFor(afterTotals, state.perspectiveTeamIndex),
    beforeMean,
    afterMean,
    weak: yourSides.weak,
    strong: yourSides.strong,
    matchedWeak: matchedWeaks(yourSides, theirSides),
  })
  const themAssessment = assessSide({
    before: totalsFor(beforeTotals, tradePackage.counterpartyTeamIndex),
    after: totalsFor(afterTotals, tradePackage.counterpartyTeamIndex),
    beforeMean,
    afterMean,
    weak: theirSides.weak,
    strong: theirSides.strong,
    matchedWeak: matchedWeaks(theirSides, yourSides),
  })

  if (!youAssessment.improved) {
    return { ruleSentence: "None of your matched weak categories improve." }
  }
  if (!themAssessment.improved) {
    return { ruleSentence: "None of their matched weak categories improve." }
  }
  if (!youAssessment.strengthsIntact) {
    return { ruleSentence: "One of your strengths finishes on the bad side of the league mean." }
  }
  if (!themAssessment.strengthsIntact) {
    return { ruleSentence: "One of their strengths finishes on the bad side of the league mean." }
  }

  return {}
}

export const simulateTrade = (
  state: SeasonLeagueState,
  input: SimulateTradeInput,
): TradeSimulationResult | null => {
  const youCount = input.youPlayerIds.length
  const themCount = input.themPlayerIds.length
  const yourIds = idsOnTeam(state, state.perspectiveTeamIndex)
  const theirIds = idsOnTeam(state, input.counterpartyTeamIndex)
  const known = input.youPlayerIds.every((id) => yourIds.has(id))
    && input.themPlayerIds.every((id) => theirIds.has(id))

  if (
    youCount < 1
    || themCount < 1
    || youCount > 2
    || themCount > 2
    || !known
  ) {
    return null
  }

  const tradePackage: TradePackage = {
    shape: shapeFor(youCount, themCount),
    counterpartyTeamIndex: input.counterpartyTeamIndex,
    youPlayerIds: input.youPlayerIds,
    themPlayerIds: input.themPlayerIds,
  }
  const application = applyTradePackage(state, tradePackage, undefined, [], {
    yourDropPlayerId: input.yourDropPlayerId,
    skipEmptyIlSlots: true,
  })
  const landed = (teamIndex: number, incoming: string[]) => {
    const present = idsOnTeam(application.state, teamIndex)

    return incoming.every((id) => present.has(id))
  }
  const youReceiveMore = themCount > youCount

  if (
    application.rejected
    || !landed(state.perspectiveTeamIndex, input.themPlayerIds)
    || !landed(input.counterpartyTeamIndex, input.youPlayerIds)
  ) {
    return {
      status: "unfit",
      sentence: youReceiveMore
        ? "Your roster cannot fit the extra player."
        : "Their roster cannot fit the extra player.",
    }
  }

  const context = createTradeAnalysisContext(state)
  const beforeTotals = context.totalsByTeam
  const afterTotals = totalsAfterTrade(application.state, tradePackage, context)
  const before = analyzeTeamTotals(beforeTotals)
  const after = analyzeTeamTotals(afterTotals)
  const beforePlaces = overallPlaces(beforeTotals.map((team) => ({
    teamIndex: team.teamIndex,
    ranks: ranksFor(before, team.teamIndex),
  })))
  const afterPlaces = overallPlaces(afterTotals.map((team) => ({
    teamIndex: team.teamIndex,
    ranks: ranksFor(after, team.teamIndex),
  })))
  const side = (teamIndex: number): SideRankReport => {
    const beforePlace = beforePlaces.find((place) => place.teamIndex === teamIndex)!
    const afterPlace = afterPlaces.find((place) => place.teamIndex === teamIndex)!
    const beforeTeam = beforeTotals.find((team) => team.teamIndex === teamIndex)!.totals
    const afterTeam = afterTotals.find((team) => team.teamIndex === teamIndex)!.totals

    return {
      overallBefore: beforePlace.rank,
      overallAfter: afterPlace.rank,
      rankSumBefore: beforePlace.rankSum,
      rankSumAfter: afterPlace.rankSum,
      categories: ALL_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        beforeTotal: beforeTeam[categoryId],
        afterTotal: afterTeam[categoryId],
        rankBefore: ranksFor(before, teamIndex)[categoryId],
        rankAfter: ranksFor(after, teamIndex)[categoryId],
      })),
    }
  }
  const values = replacementScaledValues(buildPlayerValueMap(state))
  const giveTotal = packageTotal(input.youPlayerIds, values)
  const getTotal = packageTotal(input.themPlayerIds, values)
  const shapeCheck = passesShapeRules(tradePackage, values)
  const valueLine = formatValueLine(
    shapeCheck.overpayRatio === undefined
      ? {
        giveLarger: giveTotal > getTotal,
        valueGap: evenValueGap(tradePackage, values),
      }
      : { giveLarger: giveTotal > getTotal, overpayRatio: shapeCheck.overpayRatio },
  )

  return {
    status: "ready",
    you: side(state.perspectiveTeamIndex),
    them: side(input.counterpartyTeamIndex),
    valueLine,
    ...(application.yourDroppedPlayerId
      ? { yourDroppedPlayerId: application.yourDroppedPlayerId }
      : {}),
    ...(application.theirDroppedPlayerId
      ? { theirDroppedPlayerId: application.theirDroppedPlayerId }
      : {}),
    ...ruleFields(state, tradePackage, beforeTotals, afterTotals, values, shapeCheck.ok),
  }
}
