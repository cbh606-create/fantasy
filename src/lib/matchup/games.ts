import {
  B2B_NIGHT2_MIN_OPPORTUNITIES,
  B2B_SECOND_NIGHT_PLAY_RATE,
  WEEKLY_ADD_LIMIT,
} from "@/lib/matchup/constants"
import { normalizeNbaTeamAbbr } from "@/lib/nba/teamAbbr"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"
import night2File from "../../../data/players/b2b_night2_2025_26.json"

export type B2bNight2RateRow = {
  appearances: number
  opportunities: number
}

type Night2File = {
  players?: Record<string, B2bNight2RateRow>
}

const loadedNight2Rates = (): Record<string, B2bNight2RateRow> =>
  (night2File as Night2File).players ?? {}

let night2RateTable: Record<string, B2bNight2RateRow> = loadedNight2Rates()

export const setB2bNight2RateTableForTests = (
  rows: Record<string, B2bNight2RateRow>,
) => {
  night2RateTable = rows
}

export const night2PlayRateFromLogs = (
  appearances: number,
  opportunities: number,
): number => {
  if (opportunities < B2B_NIGHT2_MIN_OPPORTUNITIES) {
    return B2B_SECOND_NIGHT_PLAY_RATE
  }
  return appearances / opportunities
}

export const b2bNight2PlayRateForPlayer = (playerId: string): number => {
  const row = night2RateTable[playerId]
  if (!row) return B2B_SECOND_NIGHT_PLAY_RATE
  return night2PlayRateFromLogs(row.appearances, row.opportunities)
}

/** Team-only schedule match. Night-2 play rate does not change this. */
export const teamHasGameOnDate = (
  teamAbbr: string,
  date: string,
  schedule: ScheduleResponse,
): boolean => {
  const team = normalizeNbaTeamAbbr(teamAbbr)
  return schedule.games.some((game) => {
    if (game.date !== date) return false
    return (
      normalizeNbaTeamAbbr(game.homeAbbr) === team ||
      normalizeNbaTeamAbbr(game.awayAbbr) === team
    )
  })
}

const teamOnGame = teamHasGameOnDate

/**
 * ESPN weekly acquisition limit (7), not NBA game-day count.
 * Normal matchups stay at 7. All-Star / NBA Cup scoring periods that
 * span extra days scale up (10-day → 10, two full weeks → 14).
 */
export const streamingAddLimitForSchedule = (
  schedule: ScheduleResponse,
): number => {
  const days = schedule.matchup.days.length
  if (days <= 0) return WEEKLY_ADD_LIMIT
  if (days <= 8) return WEEKLY_ADD_LIMIT
  return Math.max(
    WEEKLY_ADD_LIMIT,
    Math.round((WEEKLY_ADD_LIMIT * days) / 7),
  )
}

export const previousIsoDate = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export const teamGameDates = (
  schedule: ScheduleResponse,
  teamAbbr: string,
  extraLookbackDays?: string[],
): Set<string> => {
  const team = normalizeNbaTeamAbbr(teamAbbr)
  const dates = new Set<string>()

  for (const game of schedule.games) {
    const home = normalizeNbaTeamAbbr(game.homeAbbr)
    const away = normalizeNbaTeamAbbr(game.awayAbbr)
    if (home === team || away === team) dates.add(game.date)
  }

  if (extraLookbackDays) {
    for (const day of extraLookbackDays) dates.add(day)
  }

  return dates
}

export const isB2bSecondNight = (
  teamAbbr: string,
  date: string,
  schedule: ScheduleResponse,
  lookbackDates?: string[],
): boolean => {
  const team = normalizeNbaTeamAbbr(teamAbbr)
  const gameDates = teamGameDates(schedule, team, lookbackDates)
  const previousDay = previousIsoDate(date)
  return gameDates.has(previousDay)
}

export const gameWeightForTeamDate = (
  teamAbbr: string,
  date: string,
  schedule: ScheduleResponse,
  lookbackDates?: string[],
  playerId?: string,
): number => {
  const team = normalizeNbaTeamAbbr(teamAbbr)
  const playsToday = teamOnGame(team, date, schedule)

  if (!playsToday) return 0

  if (isB2bSecondNight(team, date, schedule, lookbackDates)) {
    return playerId
      ? b2bNight2PlayRateForPlayer(playerId)
      : B2B_SECOND_NIGHT_PLAY_RATE
  }

  return 1
}

export const weightedGamesInDaysByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  days: string[],
): Map<string, number> => {
  const daySet = new Set(days)
  const map = new Map<string, number>()

  for (const player of players) {
    const teamAbbr = player.teamAbbr
      ? normalizeNbaTeamAbbr(player.teamAbbr)
      : ""
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    let total = 0
    for (const day of daySet) {
      total += gameWeightForTeamDate(teamAbbr, day, schedule, undefined, player.id)
    }
    map.set(player.id, total)
  }

  return map
}

export const weightedGamesThisWeekByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Map<string, number> =>
  weightedGamesInDaysByPlayerId(players, schedule, schedule.matchup.days)

export const gamesInDaysByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  days: string[],
): Map<string, number> => {
  const daySet = new Set(days)
  const map = new Map<string, number>()

  for (const player of players) {
    const teamAbbr = player.teamAbbr
      ? normalizeNbaTeamAbbr(player.teamAbbr)
      : ""
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    const gameDays = new Set<string>()
    for (const day of daySet) {
      if (teamOnGame(teamAbbr, day, schedule)) gameDays.add(day)
    }
    map.set(player.id, gameDays.size)
  }

  return map
}

export const gamesThisWeekByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Map<string, number> =>
  gamesInDaysByPlayerId(players, schedule, schedule.matchup.days)

/** Count B2B second nights (games days that follow another game day) in the window. */
export const b2bSecondNightsInDaysByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  days: string[],
): Map<string, number> => {
  const daySet = new Set(days)
  const map = new Map<string, number>()

  for (const player of players) {
    const teamAbbr = player.teamAbbr
      ? normalizeNbaTeamAbbr(player.teamAbbr)
      : ""
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    let count = 0
    for (const day of daySet) {
      if (!teamOnGame(teamAbbr, day, schedule)) continue
      if (isB2bSecondNight(teamAbbr, day, schedule)) count += 1
    }
    map.set(player.id, count)
  }

  return map
}

export const b2bSecondNightsThisWeekByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Map<string, number> =>
  b2bSecondNightsInDaysByPlayerId(players, schedule, schedule.matchup.days)
