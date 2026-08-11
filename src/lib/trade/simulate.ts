import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
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
import { buildPlayerValueMap } from "./value"

const findPlayerIndexes = (
  team: SeasonTeamRoster,
  playerIds: string[],
): number[] | null => {
  const indexes = playerIds.map((playerId) =>
    team.entries.findIndex((entry) => entry.playerId === playerId)
  )

  return indexes.includes(-1) ? null : indexes
}

const findOpenIndex = (
  entries: SeasonRosterEntry[],
  excludedIndexes: number[],
): number =>
  entries.findIndex(
    (entry, index) =>
      !excludedIndexes.includes(index) && entry.playerId === null,
  )

/**
 * Every rostered slot counts toward category totals, so any player the trade
 * does not touch is a legal cut. The lowest projected value is the one a
 * manager would realistically drop to open the extra spot.
 */
const findLowestValueIndex = (
  entries: SeasonRosterEntry[],
  excludedIndexes: number[],
  values: Map<string, number>,
): number => {
  let lowestIndex = -1
  let lowestValue = Number.POSITIVE_INFINITY

  entries.forEach((entry, index) => {
    if (excludedIndexes.includes(index) || !entry.playerId) {
      return
    }

    const value = values.get(entry.playerId) ?? 0

    if (value < lowestValue) {
      lowestValue = value
      lowestIndex = index
    }
  })

  return lowestIndex
}

const assignAsymmetricPlayers = (
  receivingEntries: SeasonRosterEntry[],
  receivingIndexes: number[],
  incomingPlayerIds: string[],
  values: Map<string, number>,
): string | undefined => {
  receivingEntries[receivingIndexes[0]].playerId = incomingPlayerIds[0]

  if (incomingPlayerIds.length === 1) {
    return undefined
  }

  const openIndex = findOpenIndex(receivingEntries, receivingIndexes)

  if (openIndex >= 0) {
    receivingEntries[openIndex].playerId = incomingPlayerIds[1]
    return undefined
  }

  const dropIndex = findLowestValueIndex(
    receivingEntries,
    receivingIndexes,
    values,
  )

  // Nothing left to cut only happens on a roster whose sole entries are the
  // traded slots, so the extra incoming player is the one that cannot fit.
  if (dropIndex < 0) {
    return incomingPlayerIds[1]
  }

  const droppedPlayerId = receivingEntries[dropIndex].playerId ?? undefined
  receivingEntries[dropIndex].playerId = incomingPlayerIds[1]

  return droppedPlayerId
}

export type TradeApplication = {
  state: SeasonLeagueState
  droppedPlayerId?: string
}

export const applyTradePackage = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  precomputedValues?: Map<string, number>,
): TradeApplication => {
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
    return { state: { ...state, teams } }
  }

  const yourIndexes = findPlayerIndexes(yourTeam, tradePackage.youPlayerIds)
  const theirIndexes = findPlayerIndexes(theirTeam, tradePackage.themPlayerIds)

  if (!yourIndexes || !theirIndexes) {
    return { state: { ...state, teams } }
  }

  // MVP strategy: equal packages swap pairwise. Asymmetric packages use the
  // first cleared slot, then an open slot for the extra incoming player, and
  // drop the receiver's lowest-value untouched player when the roster is full.
  if (yourIndexes.length === theirIndexes.length) {
    yourIndexes.forEach((entryIndex, index) => {
      yourTeam.entries[entryIndex].playerId = tradePackage.themPlayerIds[index]
      theirTeam.entries[theirIndexes[index]].playerId =
        tradePackage.youPlayerIds[index]
    })

    return { state: { ...state, teams } }
  }

  yourIndexes.forEach((entryIndex) => {
    yourTeam.entries[entryIndex].playerId = null
  })
  theirIndexes.forEach((entryIndex) => {
    theirTeam.entries[entryIndex].playerId = null
  })

  const values = precomputedValues ?? buildPlayerValueMap(state)
  const yourDrop = assignAsymmetricPlayers(
    yourTeam.entries,
    yourIndexes,
    tradePackage.themPlayerIds,
    values,
  )
  const theirDrop = assignAsymmetricPlayers(
    theirTeam.entries,
    theirIndexes,
    tradePackage.youPlayerIds,
    values,
  )
  const droppedPlayerId = yourDrop ?? theirDrop

  return {
    state: { ...state, teams },
    ...(droppedPlayerId ? { droppedPlayerId } : {}),
  }
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
): TradeSideImpact => ({
  needsScoreBefore: needsScore(before, teamIndex, needCategories),
  needsScoreAfter: needsScore(after, teamIndex, needCategories),
  categoryDeltas: ALL_CATEGORY_IDS.map((categoryId) => ({
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
  values: Map<string, number>
}

export const createTradeAnalysisContext = (
  state: SeasonLeagueState,
): TradeAnalysisContext => {
  const totalsByTeam = seasonTeamTotals(state)

  return {
    before: analyzeTeamTotals(totalsByTeam),
    totalsByTeam,
    playersById: new Map(state.players.map((player) => [player.id, player])),
    values: buildPlayerValueMap(state),
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

export type TradeEvaluation = {
  you: TradeSideImpact
  them: TradeSideImpact
  droppedPlayerId?: string
}

export const evaluateTrade = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  precomputedContext?: TradeAnalysisContext,
): TradeEvaluation | null => {
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
  const application = applyTradePackage(state, tradePackage, context.values)
  const after = analyzeAfterTrade(application.state, tradePackage, context)
  const yourNeeds = teamNeedsAndSurplus(
    before,
    state.perspectiveTeamIndex,
  ).need
  const theirNeeds = teamNeedsAndSurplus(
    before,
    tradePackage.counterpartyTeamIndex,
  ).need

  return {
    you: buildSideImpact(
      before,
      after,
      state.perspectiveTeamIndex,
      yourNeeds,
    ),
    them: buildSideImpact(
      before,
      after,
      tradePackage.counterpartyTeamIndex,
      theirNeeds,
    ),
    ...(application.droppedPlayerId
      ? { droppedPlayerId: application.droppedPlayerId }
      : {}),
  }
}
