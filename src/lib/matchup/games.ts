import { B2B_SECOND_NIGHT_PLAY_RATE } from "@/lib/matchup/constants"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

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
  const team = teamAbbr.toUpperCase()
  const dates = new Set<string>()

  for (const game of schedule.games) {
    const home = game.homeAbbr.toUpperCase()
    const away = game.awayAbbr.toUpperCase()
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
  const team = teamAbbr.toUpperCase()
  const gameDates = teamGameDates(schedule, team, lookbackDates)
  const previousDay = previousIsoDate(date)
  return gameDates.has(previousDay)
}

export const gameWeightForTeamDate = (
  teamAbbr: string,
  date: string,
  schedule: ScheduleResponse,
  lookbackDates?: string[],
): 0 | 1 | typeof B2B_SECOND_NIGHT_PLAY_RATE => {
  const team = teamAbbr.toUpperCase()
  const playsToday = schedule.games.some((game) => {
    if (game.date !== date) return false
    const home = game.homeAbbr.toUpperCase()
    const away = game.awayAbbr.toUpperCase()
    return home === team || away === team
  })

  if (!playsToday) return 0

  if (isB2bSecondNight(team, date, schedule, lookbackDates)) {
    return B2B_SECOND_NIGHT_PLAY_RATE
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
    const teamAbbr = player.teamAbbr?.toUpperCase()
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    let total = 0
    for (const day of daySet) {
      total += gameWeightForTeamDate(teamAbbr, day, schedule)
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
    const teamAbbr = player.teamAbbr?.toUpperCase()
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    const gameDays = new Set<string>()
    for (const game of schedule.games) {
      if (!daySet.has(game.date)) continue
      const home = game.homeAbbr.toUpperCase()
      const away = game.awayAbbr.toUpperCase()
      if (home === teamAbbr || away === teamAbbr) gameDays.add(game.date)
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
    const teamAbbr = player.teamAbbr?.toUpperCase()
    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    let count = 0
    for (const day of daySet) {
      const playsToday = schedule.games.some((game) => {
        if (game.date !== day) return false
        const home = game.homeAbbr.toUpperCase()
        const away = game.awayAbbr.toUpperCase()
        return home === teamAbbr || away === teamAbbr
      })
      if (!playsToday) continue
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
