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
import {
  adjustedChaseWinProb,
  priorityChaseCategoryId,
  streamingChaseNote,
} from "./chasePair"
import type { StatPairRow } from "@/lib/players/statPairCorrelation"
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
        ? entries.findIndex(
            (entry) =>
              slotIsOpen(entry) && eligibleForSlot(player, entry.slot),
          )
        : -1
  if (flexIndex < 0 && options?.allowFlexSlots) {
    const openSlots = entries
      .map((entry, openIndex) => ({ entry, openIndex }))
      .filter(({ entry }) => slotIsOpen(entry))
      .sort((left, right) => {
        const leftNull = left.entry.playerId === null ? 0 : 1
        const rightNull = right.entry.playerId === null ? 0 : 1
        return leftNull - rightNull
      })
    const donorIndex = entries.findIndex((entry, donorAt) => {
      if (!entry.playerId || entry.playerId === playerId) return false
      if (slotIsOpen(entry)) return false
      if (!eligibleForSlot(player, entry.slot)) return false
      const donor = resolvePlayer(playersById, entry.playerId)
      if (!donor) return false
      return openSlots.some(
        (open) =>
          open.openIndex !== donorAt &&
          eligibleForSlot(donor, open.entry.slot),
      )
    })
    const donorEntry = donorIndex >= 0 ? entries[donorIndex] : undefined
    const donorId = donorEntry?.playerId
    const donor = donorId ? resolvePlayer(playersById, donorId) : undefined
    const open = donor
      ? openSlots.find(
          (slot) =>
            slot.openIndex !== donorIndex &&
            eligibleForSlot(donor, slot.entry.slot),
        )
      : undefined
    if (donorEntry && donorId && open) {
      entries[open.openIndex] = { ...open.entry, playerId: donorId }
      entries[donorIndex] = { ...donorEntry, playerId }
      return true
    }
    return false
  }
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
  options?: { allowFlexSlots?: boolean },
): { daily: DailyLineups; seatedGameDays: number } => {
  const days = Object.keys(daily).sort().filter((day) => day >= fromDate)
  const addPlayer = resolvePlayer(playersById, addPlayerId)
  if (!addPlayer?.teamAbbr) return { daily, seatedGameDays: 0 }

  const draft = cloneDaily(daily)

  if (drop.kind === "player" && drop.playerId) {
    for (const day of days) {
      clearPlayerFromDay(draft[day], drop.playerId)
    }
  }

  let seatedGameDays = 0
  for (const day of days) {
    if (!teamHasGameOnDate(addPlayer.teamAbbr, day, schedule)) continue
    if (isDailyLineupFullForDate(draft, day, playersById, schedule)) continue
    if (
      seatStreamerIfOpen(
        draft[day],
        addPlayerId,
        day,
        playersById,
        schedule,
        options,
      )
    ) {
      seatedGameDays += 1
    }
  }

  if (seatedGameDays === 0) return { daily, seatedGameDays: 0 }

  return { daily: draft, seatedGameDays }
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

const FG_PCT_REPLACEMENT = 0.47
const FT_PCT_REPLACEMENT = 0.78

export const contestedCategoryIds = (
  board: MatchupBoard,
  chaseIds?: CategoryId[],
): CategoryId[] => {
  if (chaseIds) return chaseIds
  return board.categories
    .filter((row) => row.outcome === "L" || row.outcome === "T")
    .map((row) => row.categoryId)
}

/** Volume-aware chase help — rates use FGA/FTA × vs replacement, not raw %. */
const chaseScoreForPlayer = (
  player: SeasonPlayer,
  chaseIds: CategoryId[],
  statWindow: StatWindow = "season",
): number =>
  chaseIds.reduce((sum, categoryId) => {
    const weekly = weeklyPlayerStats(player, 1, statWindow)
    if (categoryId === "FG_PCT") {
      return (
        sum +
        (weekly.shooting.FGA *
          (weekly.projections.FG_PCT - FG_PCT_REPLACEMENT)) /
          MATCHUP_CATEGORY_SIGMOID_SCALE.FG_PCT
      )
    }
    if (categoryId === "FT_PCT") {
      return (
        sum +
        (weekly.shooting.FTA *
          (weekly.projections.FT_PCT - FT_PCT_REPLACEMENT)) /
          MATCHUP_CATEGORY_SIGMOID_SCALE.FT_PCT
      )
    }
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
  allowFlexSlots = false,
): {
  delta: number
  contestedDelta: number
  categoryDeltas: { categoryId: CategoryId; delta: number }[]
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
    { allowFlexSlots },
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
  const winProbOf = (board: MatchupBoard, categoryId: CategoryId) =>
    board.categories.find((row) => row.categoryId === categoryId)?.winProb ?? 0
  return {
    delta: afterBoard.projectedCatWins - beforeBoard.projectedCatWins,
    contestedDelta: contestedDeltaFromBoards(beforeBoard, afterBoard, chaseIds),
    categoryDeltas: (chaseIds ?? []).map((categoryId) => ({
      categoryId,
      delta: winProbOf(afterBoard, categoryId) - winProbOf(beforeBoard, categoryId),
    })),
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
  categoryDeltas: { categoryId: CategoryId; delta: number }[]
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
    statPairs?: readonly StatPairRow[]
    leakCategoryIds?: ReadonlySet<CategoryId>
    allowFlexSlots?: boolean
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
  const chaseNote = streamingChaseNote(chaseIds, options?.statPairs ?? [])
  const pairPenalty = chaseIds.length === 2 ? chaseNote.penalty : 0
  const priorityId =
    pairPenalty > 0
      ? priorityChaseCategoryId(board, chaseIds, options?.leakCategoryIds)
      : null
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
      options?.allowFlexSlots ?? false,
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
    // Prefer anyone who can start; among starters maximize expected category
    // wins (projectedCatWins), then starts, then chase as a tiebreak.
    const rightHasStarts = rightStarts > 0
    const leftHasStarts = leftStarts > 0
    if (rightHasStarts !== leftHasStarts) {
      return rightHasStarts ? 1 : -1
    }
    // Among players who can start, maximize expected category wins first.
    // Start count and chase cats break remaining ties.
    const projDelta = right.delta - left.delta
    if (Math.abs(projDelta) > 1e-6) return projDelta
    if (rightStarts !== leftStarts) return rightStarts - leftStarts
    if (pairPenalty > 0 && priorityId) {
      const adjusted = (row: (typeof scored)[number]) => {
        const priorityDelta =
          row.categoryDeltas.find((entry) => entry.categoryId === priorityId)?.delta ?? 0
        const raisesBoth = row.categoryDeltas.every((entry) => entry.delta > 1e-6)
        const raisesPriority = priorityDelta > 1e-6
        return adjustedChaseWinProb(
          row.contestedDelta,
          raisesBoth && raisesPriority,
          pairPenalty,
        )
      }
      const penaltyDelta = adjusted(right) - adjusted(left)
      if (penaltyDelta !== 0) return penaltyDelta
    }
    const chaseDelta = right.contestedDelta - left.contestedDelta
    if (chaseDelta !== 0) return chaseDelta
    const projectionChaseDelta =
      chaseScoreFor(right.playerId) - chaseScoreFor(left.playerId)
    if (projectionChaseDelta !== 0) return projectionChaseDelta
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
