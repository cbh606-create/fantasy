import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import {
  analyzeTeamTotals,
  type SeasonAnalysis,
  type TeamCategoryTotals,
} from "@/lib/season/analysis"
import type { StatBasis } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { assessSide } from "./accept"
import { classifyTeam, leagueMeans, matchedWeaks, teamsMatch } from "./classify"
import { BEST_PLAYER_GAP, FAIRNESS_BAND, OVERPAY_RATIO } from "./constants"
import { formatValueLine } from "./offerCopy"
import { overallPlaces } from "./overallPlace"
import {
  evenValueGap,
  passesShapeRules,
} from "./score"
import { buildPlayerValueMap } from "./value"
import type { TradePackage, TradeShape } from "./types"
import {
  applyTradePackage,
  createTradeAnalysisContext,
  totalsAfterTrade,
} from "./simulate"

export type SimulateTradeInput = {
  counterpartyTeamIndex: number
  youPlayerIds: string[]
  themPlayerIds: string[]
  yourDropPlayerId?: string
  basis?: StatBasis
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
    replacementPlayerId?: string
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

const reportForTeam = (
  analysis: SeasonAnalysis,
  totalsByTeam: { teamIndex: number, totals: Record<CategoryId, number> }[],
  places: { teamIndex: number, rank: number, rankSum: number }[],
  teamIndex: number,
): SideRankReport | null => {
  const place = places.find((row) => row.teamIndex === teamIndex)
  const totals = totalsByTeam.find((team) => team.teamIndex === teamIndex)?.totals
  if (!place || !totals) return null

  const ranks = ranksFor(analysis, teamIndex)

  return {
    overallBefore: place.rank,
    overallAfter: place.rank,
    rankSumBefore: place.rankSum,
    rankSumAfter: place.rankSum,
    categories: ALL_CATEGORY_IDS.map((categoryId) => ({
      categoryId,
      beforeTotal: totals[categoryId],
      afterTotal: totals[categoryId],
      rankBefore: ranks[categoryId],
      rankAfter: ranks[categoryId],
    })),
  }
}

export const standingReports = (
  state: SeasonLeagueState,
  counterpartyTeamIndex: number,
  basis: StatBasis = "total",
): { you: SideRankReport, them: SideRankReport } | null => {
  const context = createTradeAnalysisContext(state, basis)
  const places = overallPlaces(context.totalsByTeam.map((team) => ({
    teamIndex: team.teamIndex,
    ranks: ranksFor(context.before, team.teamIndex),
  })))
  const you = reportForTeam(
    context.before,
    context.totalsByTeam,
    places,
    state.perspectiveTeamIndex,
  )
  const them = reportForTeam(
    context.before,
    context.totalsByTeam,
    places,
    counterpartyTeamIndex,
  )
  if (!you || !them) return null

  return { you, them }
}

const packageTotal = (playerIds: string[], values: Map<string, number>) =>
  playerIds.reduce((sum, playerId) => sum + (values.get(playerId) ?? 0), 0)

const topAvailablePlayer = (
  state: SeasonLeagueState,
  values: Map<string, number>,
): SeasonPlayer | null => {
  const available = new Set(state.availablePlayerIds)
  let best: SeasonPlayer | null = null
  let bestValue = Number.NEGATIVE_INFINITY

  for (const player of state.players) {
    if (!available.has(player.id)) continue
    const value = values.get(player.id) ?? 0
    if (!best || value > bestValue || (value === bestValue && player.id < best.id)) {
      best = player
      bestValue = value
    }
  }

  return best
}

const sideName = (count: number) => {
  if (count === 1) return "one-player"
  if (count === 2) return "two-player"
  if (count === 3) return "three-player"
  return `${count}-player`
}

const ruleFields = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  beforeTotals: TeamCategoryTotals[],
  afterTotals: TeamCategoryTotals[],
  values: Map<string, number>,
  shapeCheck: { ok: boolean; overpayRatio?: number; bestPlayerGap?: number },
): { ruleSentence?: string } => {
  const giveTotal = packageTotal(tradePackage.youPlayerIds, values)
  const getTotal = packageTotal(tradePackage.themPlayerIds, values)
  const even = tradePackage.youPlayerIds.length === tradePackage.themPlayerIds.length
  const bestSentence = `The best player on one side is more than ${BEST_PLAYER_GAP.toFixed(2)} above the other.`
  const sumSpread = Math.abs(giveTotal - getTotal) / Math.max(giveTotal, getTotal, 1e-6)

  if (!shapeCheck.ok && even && sumSpread <= FAIRNESS_BAND) {
    return { ruleSentence: bestSentence }
  }

  if (!shapeCheck.ok && even) {
    return {
      ruleSentence: giveTotal > getTotal
        ? "Your package is more than 10% larger."
        : "Their package is more than 10% larger.",
    }
  }

  if (!shapeCheck.ok && (shapeCheck.overpayRatio ?? 0) >= OVERPAY_RATIO) {
    return { ruleSentence: bestSentence }
  }

  if (!shapeCheck.ok) {
    const more = Math.max(tradePackage.youPlayerIds.length, tradePackage.themPlayerIds.length)
    const less = Math.min(tradePackage.youPlayerIds.length, tradePackage.themPlayerIds.length)
    return {
      ruleSentence: `The ${sideName(more)} side is below 1.2× the ${sideName(less)} side.`,
    }
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
    || youCount > 3
    || themCount > 3
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

  const context = createTradeAnalysisContext(state, input.basis ?? "total")
  const beforeTotals = context.totalsByTeam
  const values = buildPlayerValueMap(state)
  const youSendOneMore = youCount === themCount + 1
  const replacement = application.yourDroppedPlayerId || youSendOneMore
    ? topAvailablePlayer(state, values)
    : null
  const afterTotals = totalsAfterTrade(
    application.state,
    tradePackage,
    context,
    replacement,
  )
  const before = context.before
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
  const giveTotal = packageTotal(input.youPlayerIds, values)
  const getTotal = packageTotal(input.themPlayerIds, values)
  const shapeCheck = passesShapeRules(tradePackage, values)
  const valueLine = shapeCheck.overpayRatio === undefined
    ? formatValueLine({
      giveLarger: giveTotal > getTotal,
      valueGap: evenValueGap(tradePackage, values),
    })
    : `The ${sideName(Math.max(youCount, themCount))} side is ${shapeCheck.overpayRatio.toFixed(2)}× the ${sideName(Math.min(youCount, themCount))} side`

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
    ...(replacement ? { replacementPlayerId: replacement.id } : {}),
    ...ruleFields(state, tradePackage, beforeTotals, afterTotals, values, shapeCheck),
  }
}
