import type { CategoryId } from "@/lib/domain/types"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import {
  isDailyLineupFullForDate,
  type DailyLineups,
  youTotalsFromDaily,
} from "./dailyLineups"
import { eligibleForSlot } from "./eligibility"
import { gameWeightForTeamDate } from "./games"
import type { MatchupBoard, WinnerStreamRecipe } from "./types"
import { compareStreamerRank, winnerPriorHits } from "./winnerStreamPrior"

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
  return gameWeightForTeamDate(occupant.teamAbbr, date, schedule) === 0
}

export const seatStreamerIfOpen = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
  date: string,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): boolean => {
  if (!entries) return false
  if (entries.some((entry) => entry.playerId === playerId)) return true

  const player = resolvePlayer(playersById, playerId)
  if (!player) return false

  const slotIsOpen = (entry: SeasonRosterEntry): boolean => {
    if (entry.playerId === null) return true
    return occupantHasNoGame(entry.playerId, date, playersById, schedule)
  }

  const index = entries.findIndex(
    (entry) => slotIsOpen(entry) && eligibleForSlot(player, entry.slot),
  )
  if (index < 0) return false
  const slot = entries[index]
  if (!slot) return false
  entries[index] = { ...slot, playerId }
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

  let seatedGameDays = 0
  for (const day of days) {
    if (gameWeightForTeamDate(addPlayer.teamAbbr, day, schedule) === 0) continue
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

export const projectedCatWinsFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  oppDaily?: DailyLineups,
): number => {
  const categoryIds = categoryIdsFromBoard(board)
  if (categoryIds.length === 0) return 0
  const you = youTotalsFromDaily(daily, players, schedule)
  const opp = oppDaily
    ? youTotalsFromDaily(oppDaily, players, schedule)
    : oppTotalsFromBoard(board)
  return buildMatchupBoard(you, opp, categoryIds).projectedCatWins
}

const scoreStreamerMoveWithBefore = (
  workingDaily: DailyLineups,
  fromDate: string,
  addPlayerId: string,
  drop: StreamerMoveDrop,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  board: MatchupBoard,
  before: number,
  oppDaily?: DailyLineups,
): { delta: number; seatedGameDays: number; nextDaily: DailyLineups } | null => {
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
  const after = projectedCatWinsFromDaily(
    applied.daily,
    players,
    schedule,
    board,
    oppDaily,
  )
  return {
    delta: after - before,
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
): { delta: number; seatedGameDays: number; nextDaily: DailyLineups } | null => {
  const before = projectedCatWinsFromDaily(
    workingDaily,
    players,
    schedule,
    board,
    oppDaily,
  )
  return scoreStreamerMoveWithBefore(
    workingDaily,
    fromDate,
    addPlayerId,
    drop,
    players,
    schedule,
    board,
    before,
    oppDaily,
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
    recipes?: WinnerStreamRecipe[]
    oppDaily?: DailyLineups
  },
): {
  playerId: string
  delta: number
  nextDaily: DailyLineups
  alternativePlayerIds: string[]
} | null => {
  const requirePositiveDelta = options?.requirePositiveDelta ?? true
  const recipes = options?.recipes ?? []
  const playersById = new Map(players.map((player) => [player.id, player]))
  const hitsFor = (playerId: string) => {
    const player = playersById.get(playerId)
    if (!player) return 0
    return winnerPriorHits(player, board, recipes)
  }
  const before = projectedCatWinsFromDaily(
    workingDaily,
    players,
    schedule,
    board,
    options?.oppDaily,
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
      before,
      options?.oppDaily,
    )
    if (!result) return []
    return [{ playerId, index, ...result }]
  })
  const ranked = scored
    .filter((row) => (requirePositiveDelta ? row.delta > 0 : true))
    .sort((left, right) =>
      compareStreamerRank(
        { delta: left.delta, hits: hitsFor(left.playerId), index: left.index },
        { delta: right.delta, hits: hitsFor(right.playerId), index: right.index },
      ),
    )
  const winner = ranked[0]
  if (!winner) return null

  const alternativePlayerIds = scored
    .filter((row) => row.playerId !== winner.playerId)
    .sort((left, right) =>
      compareStreamerRank(
        { delta: left.delta, hits: hitsFor(left.playerId), index: left.index },
        { delta: right.delta, hits: hitsFor(right.playerId), index: right.index },
      ),
    )
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
