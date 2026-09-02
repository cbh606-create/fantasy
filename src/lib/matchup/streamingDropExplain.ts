import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import {
  type DailyLineups,
  effectiveGamesByPlayerId,
  youTotalsFromDaily,
} from "./dailyLineups"
import { categoryIdsFromBoard, oppTotalsFromBoard } from "./streamerMove"
import type { MatchupBoard, MatchupCategoryRow } from "./types"
import { weeklyPlayerStats } from "./weekly"

export type SuggestStreamingDropInput = {
  rosterPlayerIds: string[]
  players: SeasonPlayer[]
  workingDaily: DailyLineups
  fromDate: string
  schedule: ScheduleResponse
  board: MatchupBoard
}

export type SuggestedStreamingDrop = {
  playerId: string
  categoryIds: CategoryId[]
}

export const isContestedCategoryRow = (row: MatchupCategoryRow): boolean =>
  row.outcome === "L" || row.outcome === "T" || row.winProb < 0.65

const shortLabels = (categoryIds: CategoryId[]): string =>
  categoryIds.map((categoryId) => CATEGORY_SHORT_LABELS[categoryId]).join(", ")

export const formatSuggestedDropTooltip = (
  name: string,
  categoryIds: CategoryId[],
): string => `Suggested drop: ${name} — weakest for ${shortLabels(categoryIds)}`

export const formatHelpsCatsLine = (categoryIds: CategoryId[]): string =>
  `Helps ${shortLabels(categoryIds)}`

export const targetCategoryIdsFromBoards = (
  before: MatchupBoard,
  after: MatchupBoard,
): CategoryId[] => {
  const afterById = new Map(
    after.categories.map((row) => [row.categoryId, row]),
  )

  return before.categories
    .flatMap((beforeRow) => {
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
): number => {
  if (!player) return 0
  const projections = weeklyPlayerStats(player, games).projections
  return contestedIds.reduce(
    (sum, categoryId) => sum + catContribution(projections, categoryId),
    0,
  )
}

export const suggestStreamingDrop = (
  input: SuggestStreamingDropInput,
): SuggestedStreamingDrop | null => {
  const { rosterPlayerIds, players, workingDaily, fromDate, schedule, board } =
    input
  if (rosterPlayerIds.length === 0) return null

  const contestedIds = board.categories
    .filter(isContestedCategoryRow)
    .map((row) => row.categoryId)
  const contestedIdSet = new Set(contestedIds)
  const beforeScore = contestedWinProbSum(board, contestedIdSet)
  const categoryIds = categoryIdsFromBoard(board)
  const opp = oppTotalsFromBoard(board)
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
      youTotalsFromDaily(nextDaily, players, schedule),
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
      )
      const playerScore = weeklyContestedContribution(
        playersById.get(playerId),
        gamesByPlayerId.get(playerId) ?? 0,
        contestedIds,
      )
      return playerScore < worstScore ? playerId : worstId
    })

  const chosen = playersById.get(chosenId)
  const projections = chosen
    ? weeklyPlayerStats(chosen, gamesByPlayerId.get(chosenId) ?? 0).projections
    : ({} as Record<CategoryId, number>)

  return {
    playerId: chosenId,
    categoryIds: weakestContestedCategoryIds(projections, contestedIds),
  }
}
