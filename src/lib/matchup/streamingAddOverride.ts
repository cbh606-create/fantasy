import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "@/lib/matchup/types"
import { playerHasGameOnDate } from "@/lib/matchup/games"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

export type StreamingAddLock = {
  date: string
  spotIndex: number
  playerId: string
  holdUntil: string
}

export const playersLockedOnDate = (
  locks: readonly StreamingAddLock[],
  date: string,
): Set<string> => {
  const ids = new Set<string>()
  for (const lock of locks) {
    if (date >= lock.date && date <= lock.holdUntil) ids.add(lock.playerId)
  }
  return ids
}

export const addOverrideCandidates = (input: {
  players: readonly SeasonPlayer[]
  availableIds: ReadonlySet<string>
  date: string
  schedule: ScheduleResponse
  locks: readonly StreamingAddLock[]
  query: string
}): SeasonPlayer[] => {
  const locked = playersLockedOnDate(input.locks, input.date)
  const needle = input.query.trim().toLowerCase()
  return input.players.filter((player) => {
    if (!input.availableIds.has(player.id)) return false
    if (locked.has(player.id)) return false
    if (!playerHasGameOnDate(player, input.date, input.schedule)) return false
    if (!needle) return true
    return player.name.toLowerCase().includes(needle)
  })
}

export const categoryTotalDeltas = (
  locked: MatchupBoard,
  baseline: MatchupBoard,
): Partial<Record<CategoryId, number>> => {
  const deltas: Partial<Record<CategoryId, number>> = {}
  for (const row of locked.categories) {
    const base = baseline.categories.find(
      (item) => item.categoryId === row.categoryId,
    )
    if (!base) continue
    const delta = row.you - base.you
    if (delta !== 0) deltas[row.categoryId] = delta
  }
  return deltas
}
