import type { CategoryId } from "@/lib/domain/types"
import {
  analyzeTeamTotals,
  rosterPlayers,
  seasonTeamTotals,
  teamTotals,
  type SeasonAnalysis,
  type TeamCategoryTotals,
} from "@/lib/season/analysis"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonTeamRoster,
} from "@/lib/season/types"
import { needsScore, teamNeedsAndSurplus } from "./needs"
import type { TradePackage, TradeSideImpact } from "./types"

const findPlayerIndexes = (
  team: SeasonTeamRoster,
  playerIds: string[],
): number[] | null => {
  const indexes = playerIds.map((playerId) =>
    team.entries.findIndex((entry) => entry.playerId === playerId)
  )

  return indexes.includes(-1) ? null : indexes
}

const findOverflowIndex = (
  entries: SeasonRosterEntry[],
  excludedIndexes: number[],
): number => {
  const nullIndex = entries.findIndex(
    (entry, index) =>
      !excludedIndexes.includes(index) && entry.playerId === null,
  )

  if (nullIndex >= 0) {
    return nullIndex
  }

  return entries.findIndex(
    (entry, index) => !excludedIndexes.includes(index) && entry.slot === "BE",
  )
}

const assignAsymmetricPlayers = (
  receivingEntries: SeasonRosterEntry[],
  receivingIndexes: number[],
  incomingPlayerIds: string[],
) => {
  receivingEntries[receivingIndexes[0]].playerId = incomingPlayerIds[0]

  if (incomingPlayerIds.length === 1) {
    return
  }

  const overflowIndex = findOverflowIndex(receivingEntries, receivingIndexes)

  if (overflowIndex >= 0) {
    receivingEntries[overflowIndex].playerId = incomingPlayerIds[1]
  }
}

export const applyTradePackage = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
): SeasonLeagueState => {
  const teams = state.teams.map((team) => ({
    ...team,
    entries: team.entries.map((entry) => ({ ...entry })),
  }))
  const yourTeam = teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )
  const theirTeam = teams.find(
    ({ teamIndex }) => teamIndex === tradePackage.counterpartyTeamIndex,
  )

  if (!yourTeam || !theirTeam) {
    return { ...state, teams }
  }

  const yourIndexes = findPlayerIndexes(yourTeam, tradePackage.youPlayerIds)
  const theirIndexes = findPlayerIndexes(theirTeam, tradePackage.themPlayerIds)

  if (!yourIndexes || !theirIndexes) {
    return { ...state, teams }
  }

  // MVP strategy: equal packages swap pairwise. Asymmetric packages use the
  // first cleared slot, then a null or bench slot for the extra incoming player.
  if (yourIndexes.length === theirIndexes.length) {
    yourIndexes.forEach((entryIndex, index) => {
      yourTeam.entries[entryIndex].playerId = tradePackage.themPlayerIds[index]
      theirTeam.entries[theirIndexes[index]].playerId =
        tradePackage.youPlayerIds[index]
    })

    return { ...state, teams }
  }

  yourIndexes.forEach((entryIndex) => {
    yourTeam.entries[entryIndex].playerId = null
  })
  theirIndexes.forEach((entryIndex) => {
    theirTeam.entries[entryIndex].playerId = null
  })

  assignAsymmetricPlayers(
    yourTeam.entries,
    yourIndexes,
    tradePackage.themPlayerIds,
  )
  assignAsymmetricPlayers(
    theirTeam.entries,
    theirIndexes,
    tradePackage.youPlayerIds,
  )

  return { ...state, teams }
}

const categoryRank = (
  analysis: SeasonAnalysis,
  teamIndex: number,
  categoryId: CategoryId,
): number =>
  analysis.byCategory
    .find((category) => category.categoryId === categoryId)
    ?.rows.find((row) => row.teamIndex === teamIndex)
    ?.rank ?? 0

const buildSideImpact = (
  before: SeasonAnalysis,
  after: SeasonAnalysis,
  teamIndex: number,
  needCategories: CategoryId[],
  deltaCategories: CategoryId[],
): TradeSideImpact => ({
  needsScoreBefore: needsScore(before, teamIndex, needCategories),
  needsScoreAfter: needsScore(after, teamIndex, needCategories),
  categoryDeltas: deltaCategories.map((categoryId) => ({
    categoryId,
    rankBefore: categoryRank(before, teamIndex, categoryId),
    rankAfter: categoryRank(after, teamIndex, categoryId),
  })),
})

/**
 * Prepared once per league so a batch of candidate packages does not re-total
 * the ten teams a trade cannot touch. Reusing it across packages is exact: only
 * the two trading teams change rosters, and ranks are still derived from all
 * twelve totals.
 */
export type TradeAnalysisContext = {
  before: SeasonAnalysis
  totalsByTeam: TeamCategoryTotals[]
  playersById: Map<string, SeasonPlayer>
}

export const createTradeAnalysisContext = (
  state: SeasonLeagueState,
): TradeAnalysisContext => {
  const totalsByTeam = seasonTeamTotals(state)

  return {
    before: analyzeTeamTotals(totalsByTeam),
    totalsByTeam,
    playersById: new Map(state.players.map((player) => [player.id, player])),
  }
}

const analyzeAfterTrade = (
  afterState: SeasonLeagueState,
  tradePackage: TradePackage,
  context: TradeAnalysisContext,
): SeasonAnalysis => {
  const tradedTeamIndexes = [
    afterState.perspectiveTeamIndex,
    tradePackage.counterpartyTeamIndex,
  ]

  return analyzeTeamTotals(
    context.totalsByTeam.map((entry) => {
      if (!tradedTeamIndexes.includes(entry.teamIndex)) {
        return entry
      }

      const team = afterState.teams.find(
        ({ teamIndex }) => teamIndex === entry.teamIndex,
      )!

      return {
        teamIndex: entry.teamIndex,
        totals: teamTotals(rosterPlayers(team, context.playersById)),
      }
    }),
  )
}

export const evaluateTrade = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  precomputedContext?: TradeAnalysisContext,
): { you: TradeSideImpact; them: TradeSideImpact } | null => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )
  const theirTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === tradePackage.counterpartyTeamIndex,
  )

  if (
    !yourTeam
    || !theirTeam
    || !findPlayerIndexes(yourTeam, tradePackage.youPlayerIds)
    || !findPlayerIndexes(theirTeam, tradePackage.themPlayerIds)
  ) {
    return null
  }

  const context = precomputedContext ?? createTradeAnalysisContext(state)
  const before = context.before
  const after = analyzeAfterTrade(
    applyTradePackage(state, tradePackage),
    tradePackage,
    context,
  )
  const yourNeeds = teamNeedsAndSurplus(
    before,
    state.perspectiveTeamIndex,
  ).need
  const theirNeeds = teamNeedsAndSurplus(
    before,
    tradePackage.counterpartyTeamIndex,
  ).need
  const deltaCategories = [...new Set([...yourNeeds, ...theirNeeds])]

  return {
    you: buildSideImpact(
      before,
      after,
      state.perspectiveTeamIndex,
      yourNeeds,
      deltaCategories,
    ),
    them: buildSideImpact(
      before,
      after,
      tradePackage.counterpartyTeamIndex,
      theirNeeds,
      deltaCategories,
    ),
  }
}
