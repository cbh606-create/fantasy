import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"
import { CLOSE_LOSS_MIN_WIN_PROB } from "./constants"
import { buildMatchupBoard } from "./board"
import {
  type DailyLineups,
  effectiveGamesByPlayerId,
  youTotalsFromDaily,
} from "./dailyLineups"
import { categoryIdsFromBoard, oppTotalsFromBoard } from "./streamerMove"
import type { MatchupBoard, MatchupCategoryRow, StatWindow } from "./types"
import { weeklyPlayerStats } from "./weekly"

export type SuggestStreamingDropInput = {
  rosterPlayerIds: string[]
  players: SeasonPlayer[]
  workingDaily: DailyLineups
  fromDate: string
  schedule: ScheduleResponse
  board: MatchupBoard
  statWindow?: StatWindow
}

export type SuggestedStreamingDrop = {
  playerId: string
  categoryIds: CategoryId[]
}

export const CONTESTED_WIN_PROB_MIN = 0.28
export const CONTESTED_WIN_PROB_MAX = 0.72

/** Losing/tied cats at or above this are "close to a win" for chase priority. */
export const CLOSE_TO_WIN_MIN_WIN_PROB = 0.45
/** Contested cats within this distance of 0.5 are "close to a flip". */
export const CLOSE_TO_FLIP_MAX_ABS = 0.12
/** Category wins that take a 9-cat matchup. In-range losses that complete this outrank a closer lead. */
const CATEGORY_WINS_TO_TAKE_MATCHUP = 5

export const isContestedCategoryRow = (row: MatchupCategoryRow): boolean => {
  if (row.winProb < CONTESTED_WIN_PROB_MIN) return false
  if (row.winProb > CONTESTED_WIN_PROB_MAX) return false
  if (row.outcome === "W" && row.winProb >= 0.65) return false
  return true
}

const RANK_WIN_PROB_CAP = 0.7

const chaseTier = (row: MatchupCategoryRow): 0 | 1 | 2 => {
  if (
    (row.outcome === "L" || row.outcome === "T") &&
    row.winProb >= CLOSE_TO_WIN_MIN_WIN_PROB
  ) {
    return 0
  }
  if (Math.abs(row.winProb - 0.5) <= CLOSE_TO_FLIP_MAX_ABS) {
    return 1
  }
  return 2
}

const compareChaseRows = (
  left: MatchupCategoryRow,
  right: MatchupCategoryRow,
): number => {
  const tierDelta = chaseTier(left) - chaseTier(right)
  if (tierDelta !== 0) return tierDelta
  const tier = chaseTier(left)
  if (tier === 0) return right.winProb - left.winProb
  if (tier === 1) {
    return Math.abs(left.winProb - 0.5) - Math.abs(right.winProb - 0.5)
  }
  return left.winProb - right.winProb
}

const winsOnBoard = (
  board: MatchupBoard,
  puntCategoryIds: ReadonlySet<CategoryId>,
): number =>
  board.categories.filter(
    (row) => row.outcome === "W" && !puntCategoryIds.has(row.categoryId),
  ).length

/** Highest-winProb losses/ties still needed to reach 5. Empty once the board already has 5. */
const pathToWinCategoryIds = (
  candidates: readonly MatchupCategoryRow[],
  flipsNeeded: number,
): Set<CategoryId> => {
  if (flipsNeeded <= 0) return new Set()
  return new Set(
    candidates
      .filter((row) => row.outcome !== "W")
      .sort((left, right) => right.winProb - left.winProb)
      .slice(0, flipsNeeded)
      .map((row) => row.categoryId),
  )
}

/** Chase cats used by ranking and pickBestStreamerMove. Path to 5, then close-to-win, then flip, then weak. */
export const chaseCategoryIds = (
  board: MatchupBoard,
  puntCategoryIds: ReadonlySet<CategoryId> = new Set(),
): CategoryId[] => {
  const contested = board.categories.filter(
    (row) =>
      isContestedCategoryRow(row) &&
      row.winProb < RANK_WIN_PROB_CAP &&
      !puntCategoryIds.has(row.categoryId),
  )
  const pathIds = pathToWinCategoryIds(
    contested,
    CATEGORY_WINS_TO_TAKE_MATCHUP - winsOnBoard(board, puntCategoryIds),
  )
  const chaseCap = pathIds.size >= 3 ? 3 : 2
  return [...contested]
    .sort((left, right) => {
      const leftOnPath = pathIds.has(left.categoryId) ? 0 : 1
      const rightOnPath = pathIds.has(right.categoryId) ? 0 : 1
      if (leftOnPath !== rightOnPath) return leftOnPath - rightOnPath
      if (leftOnPath === 0) return right.winProb - left.winProb
      return compareChaseRows(left, right)
    })
    .slice(0, chaseCap)
    .map((row) => row.categoryId)
}

export const isCloseLosingCategory = (row: MatchupCategoryRow): boolean =>
  row.outcome === "T" ||
  (row.outcome === "L" && row.winProb >= CLOSE_LOSS_MIN_WIN_PROB)

const shortLabels = (categoryIds: CategoryId[]): string =>
  categoryIds.map((categoryId) => CATEGORY_SHORT_LABELS[categoryId]).join(", ")

export const formatSuggestedDropTooltip = (
  name: string,
  categoryIds: CategoryId[],
): string =>
  categoryIds.length === 0
    ? `Suggested drop: ${name}`
    : `Suggested drop: ${name} — weakest for ${shortLabels(categoryIds)}`

export const formatHelpsCatsLine = (categoryIds: CategoryId[]): string =>
  `Helps ${shortLabels(categoryIds)}`

export const targetCategoryIdsFromBoards = (
  before: MatchupBoard,
  after: MatchupBoard,
  allowedCategoryIds?: readonly CategoryId[],
): CategoryId[] => {
  const afterById = new Map(
    after.categories.map((row) => [row.categoryId, row]),
  )
  // undefined = no allowlist; [] = allow none (e.g. every chase cat was punted).
  // Do not treat [] as "unrestricted" — that resurfaces punted cats on Add chips.
  if (allowedCategoryIds !== undefined && allowedCategoryIds.length === 0) {
    return []
  }
  const allowed =
    allowedCategoryIds === undefined ? null : new Set(allowedCategoryIds)

  return before.categories
    .flatMap((beforeRow) => {
      if (allowed && !allowed.has(beforeRow.categoryId)) return []
      if (beforeRow.outcome === "W" && beforeRow.winProb >= 0.65) return []
      const afterRow = afterById.get(beforeRow.categoryId)
      if (!afterRow) return []
      const youImproved =
        beforeRow.categoryId === "TO"
          ? afterRow.you < beforeRow.you
          : afterRow.you > beforeRow.you
      if (!youImproved) return []
      const flippedToWin =
        (beforeRow.outcome === "L" || beforeRow.outcome === "T") &&
        afterRow.outcome === "W"
      if (!isContestedCategoryRow(afterRow) && !flippedToWin) return []
      return [
        {
          categoryId: beforeRow.categoryId,
          delta: afterRow.winProb - beforeRow.winProb,
        },
      ]
    })
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 3)
    .map((row) => row.categoryId)
}

const removePlayerFromDailyFromDate = (
  daily: DailyLineups,
  playerId: string,
  fromDate: string,
): DailyLineups =>
  Object.fromEntries(
    Object.entries(daily).map(([day, entries]) => [
      day,
      entries.map((entry) =>
        day >= fromDate && entry.playerId === playerId
          ? { ...entry, playerId: null }
          : { ...entry },
      ),
    ]),
  )

const contestedWinProbSum = (
  board: MatchupBoard,
  contestedIds: ReadonlySet<CategoryId>,
): number =>
  board.categories.reduce(
    (sum, row) => (contestedIds.has(row.categoryId) ? sum + row.winProb : sum),
    0,
  )

const catContribution = (
  projections: Record<CategoryId, number>,
  categoryId: CategoryId,
): number => {
  const value = projections[categoryId] ?? 0
  return categoryId === "TO" ? -value : value
}

const weakestContestedCategoryIds = (
  projections: Record<CategoryId, number>,
  contestedIds: CategoryId[],
): CategoryId[] =>
  [...contestedIds]
    .sort(
      (left, right) =>
        catContribution(projections, left) - catContribution(projections, right),
    )
    .slice(0, 3)

const weeklyContestedContribution = (
  player: SeasonPlayer | undefined,
  games: number,
  contestedIds: CategoryId[],
  window: StatWindow = "season",
): number => {
  if (!player) return 0
  const projections = weeklyPlayerStats(player, games, window).projections
  return contestedIds.reduce(
    (sum, categoryId) => sum + catContribution(projections, categoryId),
    0,
  )
}

export const suggestStreamingDrop = (
  input: SuggestStreamingDropInput,
): SuggestedStreamingDrop | null => {
  const {
    rosterPlayerIds,
    players,
    workingDaily,
    fromDate,
    schedule,
    board,
    statWindow = "season",
  } = input
  if (rosterPlayerIds.length === 0) return null

  const contestedIds = board.categories
    .filter(isContestedCategoryRow)
    .map((row) => row.categoryId)
  const contestedIdSet = new Set(contestedIds)
  const categoryIds = categoryIdsFromBoard(board)
  const opp = oppTotalsFromBoard(board)
  const beforeBoard = buildMatchupBoard(
    youTotalsFromDaily(workingDaily, players, schedule, statWindow),
    opp,
    categoryIds,
  )
  const beforeScore = contestedWinProbSum(beforeBoard, contestedIdSet)
  const gamesByPlayerId = effectiveGamesByPlayerId(
    workingDaily,
    players,
    schedule,
  )
  const playersById = new Map(players.map((player) => [player.id, player]))

  let bestPositiveId: string | null = null
  let bestPositiveDelta = 0

  for (const playerId of rosterPlayerIds) {
    const nextDaily = removePlayerFromDailyFromDate(
      workingDaily,
      playerId,
      fromDate,
    )
    const afterBoard = buildMatchupBoard(
      youTotalsFromDaily(nextDaily, players, schedule, statWindow),
      opp,
      categoryIds,
    )
    const delta = contestedWinProbSum(afterBoard, contestedIdSet) - beforeScore
    if (delta > bestPositiveDelta) {
      bestPositiveDelta = delta
      bestPositiveId = playerId
    }
  }

  const chosenId =
    bestPositiveId ??
    rosterPlayerIds.reduce((worstId, playerId) => {
      const worstScore = weeklyContestedContribution(
        playersById.get(worstId),
        gamesByPlayerId.get(worstId) ?? 0,
        contestedIds,
        statWindow,
      )
      const playerScore = weeklyContestedContribution(
        playersById.get(playerId),
        gamesByPlayerId.get(playerId) ?? 0,
        contestedIds,
        statWindow,
      )
      return playerScore < worstScore ? playerId : worstId
    })

  const chosen = playersById.get(chosenId)
  const projections = chosen
    ? weeklyPlayerStats(
        chosen,
        gamesByPlayerId.get(chosenId) ?? 0,
        statWindow,
      ).projections
    : ({} as Record<CategoryId, number>)

  return {
    playerId: chosenId,
    categoryIds: weakestContestedCategoryIds(projections, contestedIds),
  }
}
