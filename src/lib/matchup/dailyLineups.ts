import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import { ACTIVE_SEASON_SLOTS, isActiveSlot } from "./constants"
import { weeklyPlayerStats } from "./weekly"

export type DailyLineups = Record<string, SeasonRosterEntry[]>

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

const emptyTotals = (): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as Record<CategoryId, number>

export const dailyStorageKey = (leagueId: string) => `matchup-days:${leagueId}`

export const extractActiveEntries = (
  entries: SeasonRosterEntry[],
): SeasonRosterEntry[] => {
  const active = entries.filter((entry) => isActiveSlot(entry.slot))

  return ACTIVE_SEASON_SLOTS.map((slot, index) => ({
    slot,
    playerId: active[index]?.playerId ?? null,
  }))
}

export const initDailyLineups = (
  days: string[],
  activeEntries: SeasonRosterEntry[],
): DailyLineups => {
  const template = extractActiveEntries(activeEntries)

  return Object.fromEntries(
    days.map((day) => [day, template.map((entry) => ({ ...entry }))]),
  )
}

export const readDailyLineups = (leagueId: string): DailyLineups | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(dailyStorageKey(leagueId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as DailyLineups
    if (!parsed || typeof parsed !== "object") return null

    return parsed
  } catch {
    return null
  }
}

export const writeDailyLineups = (
  leagueId: string,
  daily: DailyLineups,
): void => {
  if (typeof window === "undefined") return

  window.localStorage.setItem(dailyStorageKey(leagueId), JSON.stringify(daily))
}

export const dailyLineupsMatchDays = (
  daily: DailyLineups,
  days: string[],
): boolean => {
  if (days.length === 0) return false

  return (
    days.every((day) => Array.isArray(daily[day]) && daily[day].length === ACTIVE_SEASON_SLOTS.length) &&
    Object.keys(daily).length === days.length
  )
}

export const playerGameDays = (
  player: SeasonPlayer,
  schedule: ScheduleResponse,
): Set<string> => {
  const days = new Set<string>()
  const teamAbbr = player.teamAbbr?.toUpperCase()
  if (!teamAbbr) return days

  for (const game of schedule.games) {
    if (!schedule.matchup.days.includes(game.date)) continue

    if (
      game.homeAbbr.toUpperCase() === teamAbbr ||
      game.awayAbbr.toUpperCase() === teamAbbr
    ) {
      days.add(game.date)
    }
  }

  return days
}

export const dayOpponentLabel = (
  player: SeasonPlayer | undefined,
  day: string,
  schedule: ScheduleResponse,
): string => {
  const teamAbbr = player?.teamAbbr?.toUpperCase()
  if (!teamAbbr) return "no game"

  const labels: string[] = []

  for (const game of schedule.games) {
    if (game.date !== day) continue

    if (game.homeAbbr.toUpperCase() === teamAbbr) {
      labels.push(`vs ${game.awayAbbr.toUpperCase()}`)
    } else if (game.awayAbbr.toUpperCase() === teamAbbr) {
      labels.push(`@${game.homeAbbr.toUpperCase()}`)
    }
  }

  return labels.length > 0 ? labels.join(", ") : "no game"
}

export const effectiveGamesByPlayerId = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Map<string, number> => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const counts = new Map<string, number>()

  for (const [day, entries] of Object.entries(daily)) {
    for (const entry of entries) {
      if (!entry.playerId) continue

      const player = playersById.get(entry.playerId)
      if (!player) continue

      if (!playerGameDays(player, schedule).has(day)) continue

      counts.set(entry.playerId, (counts.get(entry.playerId) ?? 0) + 1)
    }
  }

  return counts
}

export const youTotalsFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Record<CategoryId, number> => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const gamesMap = effectiveGamesByPlayerId(daily, players, schedule)
  const totals = emptyTotals()
  let totalFGM = 0
  let totalFGA = 0
  let totalFTM = 0
  let totalFTA = 0

  const playerIds = new Set<string>()
  for (const entries of Object.values(daily)) {
    for (const entry of entries) {
      if (entry.playerId) playerIds.add(entry.playerId)
    }
  }

  for (const playerId of playerIds) {
    const player = playersById.get(playerId)
    if (!player) continue

    const weekly = weeklyPlayerStats(player, gamesMap.get(playerId) ?? 0)

    for (const categoryId of COUNTING_CATEGORIES) {
      totals[categoryId] += weekly.projections[categoryId]
    }

    totalFGM += weekly.shooting.FGM
    totalFGA += weekly.shooting.FGA
    totalFTM += weekly.shooting.FTM
    totalFTA += weekly.shooting.FTA
  }

  totals.FG_PCT = totalFGA > 0 ? totalFGM / totalFGA : 0
  totals.FT_PCT = totalFTA > 0 ? totalFTM / totalFTA : 0

  return totals
}

export const setSlotPlayer = (
  daily: DailyLineups,
  day: string,
  slotIndex: number,
  playerId: string | null,
): DailyLineups => {
  const entries = daily[day]
  if (!entries || slotIndex < 0 || slotIndex >= entries.length) {
    return daily
  }

  const nextEntries = entries.map((entry, index) => {
    if (index === slotIndex) {
      return { ...entry, playerId }
    }

    if (playerId !== null && entry.playerId === playerId) {
      return { ...entry, playerId: null }
    }

    return entry
  })

  return {
    ...daily,
    [day]: nextEntries,
  }
}

export type TogglePlayerDayResult = {
  daily: DailyLineups
  status: "started" | "sat" | "no_game" | "full" | "missing_day"
}

export const findPlayerSlotIndex = (
  daily: DailyLineups,
  day: string,
  playerId: string,
): number => {
  const entries = daily[day]
  if (!entries) return -1

  return entries.findIndex((entry) => entry.playerId === playerId)
}

export const togglePlayerDay = (
  daily: DailyLineups,
  day: string,
  playerId: string,
  hasGame: boolean,
): TogglePlayerDayResult => {
  const entries = daily[day]
  if (!entries) {
    return { daily, status: "missing_day" }
  }

  if (!hasGame) {
    return { daily, status: "no_game" }
  }

  const existingIndex = findPlayerSlotIndex(daily, day, playerId)
  if (existingIndex >= 0) {
    return {
      daily: setSlotPlayer(daily, day, existingIndex, null),
      status: "sat",
    }
  }

  const emptyIndex = entries.findIndex((entry) => entry.playerId === null)
  if (emptyIndex < 0) {
    return { daily, status: "full" }
  }

  return {
    daily: setSlotPlayer(daily, day, emptyIndex, playerId),
    status: "started",
  }
}
