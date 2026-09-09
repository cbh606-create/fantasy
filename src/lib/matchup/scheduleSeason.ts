import { buildWeekDays, formatUtcIsoDate, parseIsoDate } from "@/lib/matchup/scheduleDates"
import type { ScheduleGame, ScheduleResponse } from "@/lib/season/types"

export type SeasonScheduleFile = {
  season: string
  games: ScheduleGame[]
}

export const mondayOfWeekContaining = (isoDate: string): string => {
  const day = parseIsoDate(isoDate)
  const daysSinceMonday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - daysSinceMonday)
  return formatUtcIsoDate(day)
}

export const sliceWeekFromSeasonGames = (
  games: ScheduleGame[],
  weekStartIso: string,
): ScheduleResponse => {
  const start = parseIsoDate(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const endIso = formatUtcIsoDate(end)
  const days = buildWeekDays(weekStartIso, endIso)
  const daySet = new Set(days)
  const lookback = parseIsoDate(weekStartIso)
  lookback.setUTCDate(lookback.getUTCDate() - 1)
  const lookbackIso = formatUtcIsoDate(lookback)

  return {
    source: "season",
    matchup: {
      scoringPeriodId: Number(weekStartIso.replaceAll("-", "")),
      startDate: weekStartIso,
      endDate: endIso,
      days,
    },
    games: games.filter(
      (game) => daySet.has(game.date) || game.date === lookbackIso,
    ),
  }
}

export const nextWeekWithGames = (
  games: ScheduleGame[],
  todayIso: string,
): ScheduleResponse | null => {
  const future = games
    .map((game) => game.date)
    .filter((date) => date >= todayIso)
    .sort()
  const first = future[0]
  if (!first) return null
  return sliceWeekFromSeasonGames(games, mondayOfWeekContaining(first))
}
