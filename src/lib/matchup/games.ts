import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

export const gamesThisWeekByPlayerId = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Map<string, number> => {
  const days = schedule.matchup.days
  const map = new Map<string, number>()

  for (const player of players) {
    const teamAbbr = player.teamAbbr?.toUpperCase()

    if (!teamAbbr) {
      map.set(player.id, 0)
      continue
    }

    const gameDays = new Set<string>()

    for (const game of schedule.games) {
      if (!days.includes(game.date)) continue

      const home = game.homeAbbr.toUpperCase()
      const away = game.awayAbbr.toUpperCase()

      if (home === teamAbbr || away === teamAbbr) {
        gameDays.add(game.date)
      }
    }

    map.set(player.id, gameDays.size)
  }

  return map
}
