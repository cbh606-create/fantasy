import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import {
  isDailyLineupFullForDate,
  type DailyLineups,
} from "./dailyLineups"
import { eligibleForSlot } from "./eligibility"
import { gameWeightForTeamDate } from "./games"

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
