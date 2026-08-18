import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

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
