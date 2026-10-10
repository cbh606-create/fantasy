import type { CategoryId } from "@/lib/domain/types"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { MATCHUP_CATEGORY_SIGMOID_SCALE } from "./constants"
import {
  isDailyLineupFullForDate,
  type DailyLineups,
  youTotalsFromDaily,
} from "./dailyLineups"
import { eligibleForSlot, isSpecificPositionSlot } from "./eligibility"
import { teamHasGameOnDate } from "./games"
import { blockFromDate } from "./streamingBlocks"
import { densityTierRank } from "./streamingStrategy"
import type { MatchupBoard, StatWindow, WinnerStreamRecipe } from "./types"
import { compareStreamerRank, winnerPriorHits } from "./winnerStreamPrior"
import { weeklyPlayerStats } from "./weekly"

export type StreamerMoveDrop = {
  kind: "none" | "player"
  playerId: string | null
}

const resolvePlayer = (
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  playerId: string,
): SeasonPlayer | undefined =>
  playersById instanceof Map ? playersById.get(playerId) : playersById[playerId]

const cloneDaily = (daily: DailyLineups): DailyLineups =>
  Object.fromEntries(
    Object.entries(daily).map(([day, entries]) => [
      day,
      entries.map((entry) => ({ ...entry })),
    ]),
  )

const occupantHasNoGame = (
  playerId: string,
  date: string,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): boolean => {
  const occupant = resolvePlayer(playersById, playerId)
  if (!occupant?.teamAbbr) return true
  return !teamHasGameOnDate(occupant.teamAbbr, date, schedule)
}

export const seatStreamerIfOpen = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
  date: string,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
  options?: { allowFlexSlots?: boolean },
): boolean => {
  if (!entries) return false
  if (entries.some((entry) => entry.playerId === playerId)) return true

  const player = resolvePlayer(playersById, playerId)
  if (!player) return false

  const slotIsOpen = (entry: SeasonRosterEntry): boolean => {
    if (entry.playerId === null) return true
    return occupantHasNoGame(entry.playerId, date, playersById, schedule)
  }

  const hasEligibleSpecificEmpty = entries.some(
    (entry) =>
      entry.playerId === null &&
      isSpecificPositionSlot(entry.slot) &&
      eligibleForSlot(player, entry.slot),
  )

  const index = entries.findIndex((entry) => {
    if (!eligibleForSlot(player, entry.slot)) return false
    if (hasEligibleSpecificEmpty) {
      return entry.playerId === null && isSpecificPositionSlot(entry.slot)
    }
    return slotIsOpen(entry)
  })
  const flexIndex =
    index >= 0
      ? index
      : options?.allowFlexSlots
        ? entries.findIndex((entry) => slotIsOpen(entry))
        : -1
  if (flexIndex < 0) return false
  const slot = entries[flexIndex]
  if (!slot) return false
  entries[flexIndex] = { ...slot, playerId }
  return true
}

const clearPlayerFromDay = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
): void => {
  if (!entries) return
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry?.playerId === playerId) {
      entries[index] = { ...entry, playerId: null }
    }
  }
}

export const applyStreamerMoveToDaily = (
  daily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): { daily: DailyLineups; seatedGameDays: number } => {
  const next = cloneDaily(daily)
  const days = Object.keys(next).sort().filter((day) => day >= fromDate)

  if (drop.kind === "player" && drop.playerId) {
    for (const day of days) {
      clearPlayerFromDay(next[day], drop.playerId)
    }
  }

  const addPlayer = resolvePlayer(playersById, addPlayerId)
  if (!addPlayer?.teamAbbr) return { daily: next, seatedGameDays: 0 }

  if (isDailyLineupFullForDate(next, fromDate, playersById, schedule)) {
    return { daily: next, seatedGameDays: 0 }
  }

  if (!teamHasGameOnDate(addPlayer.teamAbbr, fromDate, schedule)) {
    return { daily: next, seatedGameDays: 0 }
  }
  if (!seatStreamerIfOpen(next[fromDate], addPlayerId, fromDate, playersById, schedule)) {
    return { daily: next, seatedGameDays: 0 }
  }

  let seatedGameDays = 1
  for (const day of days) {
    if (day === fromDate) continue
    if (!teamHasGameOnDate(addPlayer.teamAbbr, day, schedule)) continue
    if (seatStreamerIfOpen(next[day], addPlayerId, day, playersById, schedule)) {
      seatedGameDays += 1
    }
  }

  return { daily: next, seatedGameDays }
}

export const oppTotalsFromBoard = (
  board: MatchupBoard,
): Record<CategoryId, number> =>
  Object.fromEntries(
    board.categories.map((row) => [row.categoryId, row.opp]),
  ) as Record<CategoryId, number>

export const categoryIdsFromBoard = (board: MatchupBoard): CategoryId[] =>
  board.categories.map((row) => row.categoryId)

export const matchupBoardFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  oppDaily?: DailyLineups,
  statWindow?: StatWindow,
): MatchupBoard => {
  const categoryIds = categoryIdsFromBoard(board)
  const you = youTotalsFromDaily(daily, players, schedule, statWindow)
  const opp = oppDaily
    ? youTotalsFromDaily(oppDaily, players, schedule, statWindow)
    : oppTotalsFromBoard(board)
  return buildMatchupBoard(you, opp, categoryIds)
}

export const planningMatchupBoard = (
  daily: DailyLineups | undefined,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  frozenBoard: MatchupBoard,
  statWindow?: StatWindow,
): MatchupBoard => {
  if (!daily) return frozenBoard
  return matchupBoardFromDaily(
    daily,
    players,
    schedule,
    frozenBoard,
    undefined,
    statWindow,
  )
}

export const contestedCategoryIds = (
  board: MatchupBoard,
  chaseIds?: CategoryId[],
): CategoryId[] => {
  if (chaseIds) return chaseIds
  return board.categories
    .filter((row) => row.outcome === "L" || row.outcome === "T")
    .map((row) => row.categoryId)
}

const chaseScoreForPlayer = (
  player: SeasonPlayer,
  chaseIds: CategoryId[],
  statWindow: StatWindow = "season",
): number =>
  chaseIds.reduce((sum, categoryId) => {
    const weekly = weeklyPlayerStats(player, 1, statWindow)
    const raw =
      categoryId === "TO"
        ? -weekly.projections.TO
        : weekly.projections[categoryId] ?? 0
    return sum + raw / MATCHUP_CATEGORY_SIGMOID_SCALE[categoryId]
  }, 0)

const winProbSumFor = (board: MatchupBoard, categoryIds: CategoryId[]): number => {
  const byId = new Map(board.categories.map((row) => [row.categoryId, row.winProb]))
  return categoryIds.reduce((sum, categoryId) => sum + (byId.get(categoryId) ?? 0), 0)
}

const contestedDeltaFromBoards = (
  before: MatchupBoard,
  after: MatchupBoard,
  chaseIds?: CategoryId[],
): number => {
  const contestedIds = contestedCategoryIds(before, chaseIds)
  if (contestedIds.length === 0) {
    return chaseIds ? 0 : after.projectedCatWins - before.projectedCatWins
  }
  return winProbSumFor(after, contestedIds) - winProbSumFor(before, contestedIds)
}

export const projectedCatWinsFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  oppDaily?: DailyLineups,
  statWindow?: StatWindow,
): number =>
  matchupBoardFromDaily(
    daily,
    players,
    schedule,
    board,
    oppDaily,
    statWindow,
  ).projectedCatWins

const scoreStreamerMoveWithBefore = (
  workingDaily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  beforeBoard: MatchupBoard,
  oppDaily?: DailyLineups,
  statWindow?: StatWindow,
  chaseIds?: CategoryId[],
): {
  delta: number
  contestedDelta: number
  seatedGameDays: number
  nextDaily: DailyLineups
} | null => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const applied = applyStreamerMoveToDaily(
    workingDaily,
    fromDate,
    addPlayerId,
    drop,
    playersById,
    schedule,
  )
  if (applied.seatedGameDays === 0) return null
  const afterBoard = matchupBoardFromDaily(
    applied.daily,
    players,
    schedule,
    board,
    oppDaily,
    statWindow,
  )
  return {
    delta: afterBoard.projectedCatWins - beforeBoard.projectedCatWins,
    contestedDelta: contestedDeltaFromBoards(beforeBoard, afterBoard, chaseIds),
    seatedGameDays: applied.seatedGameDays,
    nextDaily: applied.daily,
  }
}

export const scoreStreamerMove = (
  workingDaily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  oppDaily?: DailyLineups,
  statWindow?: StatWindow,
): {
  delta: number
  contestedDelta: number
  seatedGameDays: number
  nextDaily: DailyLineups
} | null => {
  const beforeBoard = matchupBoardFromDaily(
    workingDaily,
    players,
    schedule,
    board,
    oppDaily,
    statWindow,
  )
  return scoreStreamerMoveWithBefore(
    workingDaily,
    fromDate,
    addPlayerId,
    drop,
    players,
    schedule,
    board,
    beforeBoard,
    oppDaily,
    statWindow,
    undefined,
  )
}

export const pickBestStreamerMove = (
  candidateIds: string[],
  workingDaily: DailyLineups,
  fromDate: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  isCompatibleAlternative: (chosenId: string, otherId: string) => boolean,
  options?: {
    requirePositiveDelta?: boolean
    requirePositiveContestedDelta?: boolean
    recipes?: WinnerStreamRecipe[]
    oppDaily?: DailyLineups
    statWindow?: StatWindow
    chaseCategoryIds?: CategoryId[]
    densityRankFor?: (playerId: string) => number
    startsFor?: (playerId: string) => number
  },
): {
  playerId: string
  delta: number
  nextDaily: DailyLineups
  alternativePlayerIds: string[]
} | null => {
  const requirePositiveDelta = options?.requirePositiveDelta ?? true
  const requirePositiveContestedDelta = options?.requirePositiveContestedDelta ?? false
  const recipes = options?.recipes ?? []
  const chaseIds = contestedCategoryIds(board, options?.chaseCategoryIds)
  const playersById = new Map(players.map((player) => [player.id, player]))
  const hitsFor = (playerId: string) => {
    const player = playersById.get(playerId)
    if (!player) return 0
    return winnerPriorHits(player, board, recipes)
  }
  const densityFor = (playerId: string, seatedGameDays: number) => {
    if (options?.densityRankFor) return options.densityRankFor(playerId)
    if (seatedGameDays <= 1) return 0
    const player = playersById.get(playerId)
    if (!player) return -1
    const block = blockFromDate(player, fromDate, schedule)
    return block ? densityTierRank(block.tier) : -1
  }
  const chaseScoreFor = (playerId: string) => {
    const player = playersById.get(playerId)
    if (!player) return 0
    return chaseScoreForPlayer(player, chaseIds, options?.statWindow)
  }
  const beforeBoard = matchupBoardFromDaily(
    workingDaily,
    players,
    schedule,
    board,
    options?.oppDaily,
    options?.statWindow,
  )
  const scored = candidateIds.flatMap((playerId, index) => {
    const result = scoreStreamerMoveWithBefore(
      workingDaily,
      fromDate,
      playerId,
      drop,
      players,
      schedule,
      board,
      beforeBoard,
      options?.oppDaily,
      options?.statWindow,
      chaseIds,
    )
    if (!result) return []
    return [{ playerId, index, ...result }]
  })
  const rankKey = (row: (typeof scored)[number]) => ({
    contestedDelta: chaseScoreFor(row.playerId),
    delta: row.delta,
    hits: hitsFor(row.playerId),
    index: row.index,
  })
  const compareMoves = (
    left: (typeof scored)[number],
    right: (typeof scored)[number],
  ) => {
    const rightStarts =
      options?.startsFor?.(right.playerId) ?? right.seatedGameDays
    const leftStarts =
      options?.startsFor?.(left.playerId) ?? left.seatedGameDays
    if (rightStarts !== leftStarts) return rightStarts - leftStarts
    const projectionChaseDelta =
      chaseScoreFor(right.playerId) - chaseScoreFor(left.playerId)
    if (projectionChaseDelta !== 0) return projectionChaseDelta
    const chaseDelta = right.contestedDelta - left.contestedDelta
    if (chaseDelta !== 0) return chaseDelta
    const densityDelta =
      densityFor(right.playerId, right.seatedGameDays) -
      densityFor(left.playerId, left.seatedGameDays)
    if (densityDelta !== 0) return densityDelta
    return compareStreamerRank(rankKey(left), rankKey(right))
  }
  const ranked = scored
    .filter((row) => {
      if (requirePositiveContestedDelta && row.contestedDelta <= 0) return false
      if (requirePositiveDelta && row.delta <= 0) return false
      return true
    })
    .sort(compareMoves)
  const winner = ranked[0]
  if (!winner) return null

  const alternativePlayerIds = scored
    .filter((row) => row.playerId !== winner.playerId)
    .sort(compareMoves)
    .filter((row) => isCompatibleAlternative(winner.playerId, row.playerId))
    .slice(0, 3)
    .map((row) => row.playerId)

  return {
    playerId: winner.playerId,
    delta: winner.delta,
    nextDaily: winner.nextDaily,
    alternativePlayerIds,
  }
}
