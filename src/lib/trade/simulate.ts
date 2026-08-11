import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague, type SeasonAnalysis } from "@/lib/season/analysis"
import type {
  SeasonLeagueState,
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

export const evaluateTrade = (
  state: SeasonLeagueState,
  tradePackage: TradePackage,
  precomputedBefore?: SeasonAnalysis,
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

  const before = precomputedBefore ?? analyzeSeasonLeague(state)
  const after = analyzeSeasonLeague(applyTradePackage(state, tradePackage))
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
