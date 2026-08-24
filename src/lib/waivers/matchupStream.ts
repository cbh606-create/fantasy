import type { CategoryId } from "@/lib/domain/types"
import { buildMatchupBoard } from "@/lib/matchup/board"
import { weightedGamesInDaysByPlayerId } from "@/lib/matchup/games"
import type { MatchupBoard } from "@/lib/matchup/types"
import { activeTeamWeeklyTotals, weeklyPlayerStats } from "@/lib/matchup/weekly"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { teamNeedsAndSurplus } from "@/lib/trade/needs"
import { applyAddDrop } from "./apply"
import {
  MATCHUP_STREAM_DAY_COUNTS,
  MAX_STREAM_ADD_CANDIDATES,
  MAX_STREAM_DROP_CANDIDATES,
  MAX_STREAM_PAIRS,
  MAX_STREAM_SUMMARY,
} from "./matchupStreamConstants"
import type {
  MatchupStreamBoardSnapshot,
  MatchupStreamMode,
  MatchupStreamPair,
  MatchupStreamPlayerSummary,
  MatchupStreamPreviewResult,
  MatchupStreamResult,
} from "./matchupStreamTypes"

export type MatchupStreamQuery = {
  state: SeasonLeagueState
  schedule: ScheduleResponse
  opponentTeamIndex?: number
  dayCount?: number
}

export type MatchupStreamPreviewQuery = MatchupStreamQuery & {
  addPlayerId: string
  dropPlayerId: string | null
}

export const resolveWindowDays = (
  schedule: ScheduleResponse,
  dayCount?: number,
): string[] => {
  const days = schedule.matchup.days
  if (dayCount == null || !Number.isInteger(dayCount) || dayCount < 1) {
    return [...days]
  }
  return days.slice(0, Math.min(dayCount, days.length))
}

export const isAllowedDayCount = (value: number): boolean =>
  (MATCHUP_STREAM_DAY_COUNTS as readonly number[]).includes(value)

const resolveStreamMode = (
  state: SeasonLeagueState,
  opponentTeamIndex?: number,
): { mode: MatchupStreamMode; opponentTeamIndex: number | null } => {
  if (
    opponentTeamIndex == null ||
    !Number.isInteger(opponentTeamIndex) ||
    opponentTeamIndex === state.perspectiveTeamIndex
  ) {
    return { mode: "volume", opponentTeamIndex: null }
  }

  const opponentExists = state.teams.some(
    (team) => team.teamIndex === opponentTeamIndex,
  )
  if (!opponentExists) {
    return { mode: "volume", opponentTeamIndex: null }
  }

  return { mode: "matchup", opponentTeamIndex }
}

const resolveNeedCategories = (state: SeasonLeagueState): CategoryId[] => {
  const analysis = analyzeSeasonLeague(state)
  const needs = teamNeedsAndSurplus(analysis, state.perspectiveTeamIndex).need
  if (needs.length > 0) {
    return needs
  }

  const youLevels = analysis.byTeam.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )?.levels ?? []

  return youLevels
    .filter((level) => level.kind === "negative")
    .map((level) => level.categoryId)
}

const signedCategoryValue = (
  projections: Record<CategoryId, number>,
  categoryId: CategoryId,
): number =>
  categoryId === "TO" ? -projections[categoryId] : projections[categoryId]

const needContribution = (
  player: SeasonPlayer | undefined,
  games: number,
  needCategories: CategoryId[],
): number => {
  if (!player || needCategories.length === 0) {
    return 0
  }

  const weekly = weeklyPlayerStats(player, games)
  return needCategories.reduce(
    (sum, categoryId) =>
      sum + signedCategoryValue(weekly.projections, categoryId),
    0,
  )
}

const helpedNeedCategories = (
  player: SeasonPlayer | undefined,
  games: number,
  needCategories: CategoryId[],
): CategoryId[] => {
  if (!player || needCategories.length === 0) {
    return []
  }

  const weekly = weeklyPlayerStats(player, games)
  return needCategories
    .map((categoryId) => ({
      categoryId,
      value: signedCategoryValue(weekly.projections, categoryId),
    }))
    .filter(({ value }) => value > 0)
    .sort((left, right) => right.value - left.value)
    .map(({ categoryId }) => categoryId)
}

const playersByIdFrom = (
  state: SeasonLeagueState,
): Map<string, SeasonPlayer> =>
  new Map(state.players.map((player) => [player.id, player]))

const buildBoardForState = (
  state: SeasonLeagueState,
  gamesMap: Map<string, number>,
  opponentTeamIndex: number,
): MatchupBoard | null => {
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const oppTeam = state.teams.find(
    (team) => team.teamIndex === opponentTeamIndex,
  )
  if (!youTeam || !oppTeam) {
    return null
  }

  const playersById = playersByIdFrom(state)
  return buildMatchupBoard(
    activeTeamWeeklyTotals(youTeam.entries, playersById, gamesMap),
    activeTeamWeeklyTotals(oppTeam.entries, playersById, gamesMap),
  )
}

const toBoardSnapshot = (
  board: MatchupBoard,
): MatchupStreamBoardSnapshot => ({
  wins: board.wins,
  losses: board.losses,
  ties: board.ties,
  projectedCatWins: board.projectedCatWins,
  categories: board.categories.map(({ categoryId, you, opp, outcome }) => ({
    categoryId,
    you,
    opp,
    outcome,
  })),
})

const improvedCategories = (
  before: MatchupBoard,
  after: MatchupBoard,
): CategoryId[] =>
  before.categories
    .map((row, index) => {
      const next = after.categories[index]
      const delta = row.categoryId === "TO"
        ? row.you - (next?.you ?? row.you)
        : (next?.you ?? row.you) - row.you
      return { categoryId: row.categoryId, delta }
    })
    .filter(({ delta }) => delta > 0)
    .sort((left, right) => right.delta - left.delta)
    .map(({ categoryId }) => categoryId)

const buildPairReasons = (
  addGames: number,
  dropPlayerId: string | null,
  dropGames: number,
  helpedCategories: CategoryId[],
): string[] => {
  const reasons = helpedCategories.length > 0
    ? [`Helps ${helpedCategories.join(", ")} · ${addGames} games`]
    : [`${addGames} games`]

  if (dropPlayerId !== null && dropGames === 0) {
    reasons.push("Drop 0-game player")
  }

  return reasons
}

const summaryFor = (before: MatchupBoard, after: MatchupBoard): string => {
  const flipped = after.categories.filter((row, index) => {
    const prev = before.categories[index]
    return prev && prev.outcome !== row.outcome && row.outcome === "W"
  })
  const delta = after.projectedCatWins - before.projectedCatWins
  if (flipped.length) {
    return `Cats +${flipped.length} (${flipped.map((row) => row.categoryId).join(", ")})`
  }
  return delta >= 0
    ? `Projected cat wins +${delta.toFixed(2)}`
    : `Projected cat wins ${delta.toFixed(2)}`
}

const volumePreviewSummary = (
  addGames: number,
  dropGames: number,
  helpedCategories: CategoryId[],
): string => {
  const gamesDelta = addGames - dropGames
  const gamesPart = gamesDelta >= 0
    ? `+${gamesDelta} games vs drop`
    : `${gamesDelta} games vs drop`
  if (helpedCategories.length === 0) {
    return gamesPart
  }
  return `${gamesPart} · helps ${helpedCategories.join(", ")}`
}

const emptyResult = (
  mode: MatchupStreamMode,
  windowDays: string[],
  opponentTeamIndex: number | null,
): MatchupStreamResult => ({
  mode,
  windowDays,
  opponentTeamIndex,
  pairs: [],
  topAdds: [],
  topDrops: [],
})

const uniquePlayerIds = (playerIds: Array<string | null>): string[] => {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const playerId of playerIds) {
    if (!playerId || seen.has(playerId)) {
      continue
    }
    seen.add(playerId)
    ids.push(playerId)
  }
  return ids
}

const scoreVolumePair = (
  addPlayer: SeasonPlayer | undefined,
  dropPlayer: SeasonPlayer | undefined,
  addGames: number,
  dropGames: number,
  needCategories: CategoryId[],
): number => {
  const catDelta =
    needContribution(addPlayer, addGames, needCategories) -
    needContribution(dropPlayer, dropGames, needCategories)
  if (needCategories.length > 0) {
    return catDelta
  }
  return addGames - dropGames
}

const capAdds = (
  addIds: string[],
  playersById: Map<string, SeasonPlayer>,
  gamesMap: Map<string, number>,
  needCategories: CategoryId[],
): string[] =>
  [...addIds]
    .sort((left, right) => {
      const leftPlayer = playersById.get(left)
      const rightPlayer = playersById.get(right)
      const leftGames = gamesMap.get(left) ?? 0
      const rightGames = gamesMap.get(right) ?? 0
      const leftScore = needContribution(leftPlayer, leftGames, needCategories)
      const rightScore = needContribution(rightPlayer, rightGames, needCategories)
      return rightScore - leftScore || rightGames - leftGames || left.localeCompare(right)
    })
    .slice(0, MAX_STREAM_ADD_CANDIDATES)

const capDrops = (
  dropIds: string[],
  playersById: Map<string, SeasonPlayer>,
  gamesMap: Map<string, number>,
  needCategories: CategoryId[],
): string[] =>
  [...dropIds]
    .sort((left, right) => {
      const leftPlayer = playersById.get(left)
      const rightPlayer = playersById.get(right)
      const leftGames = gamesMap.get(left) ?? 0
      const rightGames = gamesMap.get(right) ?? 0
      const leftScore = needContribution(leftPlayer, leftGames, needCategories)
      const rightScore = needContribution(rightPlayer, rightGames, needCategories)
      return leftGames - rightGames || leftScore - rightScore || left.localeCompare(right)
    })
    .slice(0, MAX_STREAM_DROP_CANDIDATES)

const summariesFromPairs = (
  pairs: MatchupStreamPair[],
  kind: "add" | "drop",
): MatchupStreamPlayerSummary[] => {
  const best = new Map<string, MatchupStreamPlayerSummary>()

  for (const pair of pairs) {
    const playerId = kind === "add" ? pair.addPlayerId : pair.dropPlayerId
    if (!playerId) {
      continue
    }

    const games = kind === "add" ? pair.addGames : pair.dropGames
    const existing = best.get(playerId)
    if (existing && existing.score >= pair.score) {
      continue
    }

    best.set(playerId, {
      playerId,
      games,
      score: pair.score,
      reasons: pair.reasons,
    })
  }

  return [...best.values()]
    .sort((left, right) =>
      right.score - left.score || right.games - left.games ||
      left.playerId.localeCompare(right.playerId))
    .slice(0, MAX_STREAM_SUMMARY)
}

export const recommendMatchupStream = (
  input: MatchupStreamQuery,
): MatchupStreamResult => {
  const { state, schedule, opponentTeamIndex: requestedOpponent, dayCount } = input
  const windowDays = resolveWindowDays(schedule, dayCount)
  const gamesMap = weightedGamesInDaysByPlayerId(state.players, schedule, windowDays)
  const { mode, opponentTeamIndex } = resolveStreamMode(state, requestedOpponent)
  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )

  if (!youTeam) {
    return emptyResult(mode, windowDays, opponentTeamIndex)
  }

  const playersById = playersByIdFrom(state)
  const needCategories = resolveNeedCategories(state)
  const addIds = capAdds(
    state.availablePlayerIds.filter((playerId) => (gamesMap.get(playerId) ?? 0) > 0),
    playersById,
    gamesMap,
    needCategories,
  )
  const dropIds = capDrops(
    uniquePlayerIds(youTeam.entries.map((entry) => entry.playerId)),
    playersById,
    gamesMap,
    needCategories,
  )
  const hasEmptySlot = youTeam.entries.some((entry) => entry.playerId === null)
  const dropChoices: Array<string | null> = hasEmptySlot
    ? [...dropIds, null]
    : dropIds

  const pairs: MatchupStreamPair[] = []

  for (const addPlayerId of addIds) {
    for (const dropPlayerId of dropChoices) {
      const applied = applyAddDrop(state, { addPlayerId, dropPlayerId })
      if ("error" in applied) {
        continue
      }

      const addPlayer = playersById.get(addPlayerId)
      const dropPlayer = dropPlayerId ? playersById.get(dropPlayerId) : undefined
      const addGames = gamesMap.get(addPlayerId) ?? 0
      const dropGames = dropPlayerId ? gamesMap.get(dropPlayerId) ?? 0 : 0

      if (mode === "matchup" && opponentTeamIndex !== null) {
        const before = buildBoardForState(state, gamesMap, opponentTeamIndex)
        const after = buildBoardForState(applied, gamesMap, opponentTeamIndex)
        if (!before || !after) {
          continue
        }

        const score = after.projectedCatWins - before.projectedCatWins
        if (score <= 0) {
          continue
        }

        pairs.push({
          addPlayerId,
          dropPlayerId,
          addGames,
          dropGames,
          score,
          deltaCatWins: score,
          reasons: buildPairReasons(
            addGames,
            dropPlayerId,
            dropGames,
            improvedCategories(before, after),
          ),
        })
        continue
      }

      const score = scoreVolumePair(
        addPlayer,
        dropPlayer,
        addGames,
        dropGames,
        needCategories,
      )
      if (score <= 0) {
        continue
      }

      pairs.push({
        addPlayerId,
        dropPlayerId,
        addGames,
        dropGames,
        score,
        reasons: buildPairReasons(
          addGames,
          dropPlayerId,
          dropGames,
          helpedNeedCategories(addPlayer, addGames, needCategories),
        ),
      })
    }
  }

  const rankedPairs = pairs
    .sort((left, right) =>
      right.score - left.score ||
      right.addGames - left.addGames ||
      left.addPlayerId.localeCompare(right.addPlayerId))
    .slice(0, MAX_STREAM_PAIRS)

  return {
    mode,
    windowDays,
    opponentTeamIndex,
    pairs: rankedPairs,
    topAdds: summariesFromPairs(rankedPairs, "add"),
    topDrops: summariesFromPairs(rankedPairs, "drop"),
  }
}

export const previewMatchupStream = (
  input: MatchupStreamPreviewQuery,
): MatchupStreamPreviewResult | { error: string } => {
  const {
    state,
    schedule,
    addPlayerId,
    dropPlayerId,
    opponentTeamIndex: requestedOpponent,
    dayCount,
  } = input
  const windowDays = resolveWindowDays(schedule, dayCount)
  const gamesMap = weightedGamesInDaysByPlayerId(state.players, schedule, windowDays)
  const { mode, opponentTeamIndex } = resolveStreamMode(state, requestedOpponent)
  const applied = applyAddDrop(state, { addPlayerId, dropPlayerId })

  if ("error" in applied) {
    return applied
  }

  const addGames = gamesMap.get(addPlayerId) ?? 0
  const dropGames = dropPlayerId ? gamesMap.get(dropPlayerId) ?? 0 : 0

  if (mode === "volume" || opponentTeamIndex === null) {
    const playersById = playersByIdFrom(state)
    const helpedCategories = helpedNeedCategories(
      playersById.get(addPlayerId),
      addGames,
      resolveNeedCategories(state),
    )
    return {
      mode: "volume",
      windowDays,
      before: null,
      after: null,
      summary: volumePreviewSummary(addGames, dropGames, helpedCategories),
    }
  }

  const before = buildBoardForState(state, gamesMap, opponentTeamIndex)
  const after = buildBoardForState(applied, gamesMap, opponentTeamIndex)
  if (!before || !after) {
    return { error: "matchup_board_unavailable" }
  }

  return {
    mode,
    windowDays,
    before: toBoardSnapshot(before),
    after: toBoardSnapshot(after),
    summary: summaryFor(before, after),
  }
}
