import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"
import type { StreamingDensityTier } from "./types"
import { densityTierRank } from "./streamingStrategy"

export type StreamingBlock = {
  playerId: string
  startDate: string
  endDate: string
  gameDates: string[]
  tier: StreamingDensityTier
  gamesInWindow: number
  remainingWeekGames: number
}

const playsOn = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
): boolean => {
  const team = player.teamAbbr?.toUpperCase()
  if (!team) return false
  return schedule.games.some((game) => {
    if (game.date !== date) return false
    const home = game.homeAbbr.toUpperCase()
    const away = game.awayAbbr.toUpperCase()
    return home === team || away === team
  })
}

const hasB2B = (gameDates: string[], days: string[]): boolean => {
  const indices = gameDates
    .map((date) => days.indexOf(date))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1]! + 1) return true
  }
  return false
}

const tierForWindow = (
  gameDates: string[],
  days: string[],
): StreamingDensityTier => {
  const games = gameDates.length
  if (games >= 3) return "elite"
  if (games === 2) return hasB2B(gameDates, days) ? "strong" : "ok"
  return "thin"
}

const remainingWeekGames = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
): number => {
  const remaining = schedule.matchup.days.filter((day) => day >= fromDate)
  return remaining.filter((day) => playsOn(player, day, schedule)).length
}

const blockFromWindow = (
  player: SeasonPlayer,
  window: string[],
  schedule: ScheduleResponse,
): StreamingBlock | null => {
  if (window.length === 0) return null
  const gameDates = window.filter((day) => playsOn(player, day, schedule))
  if (gameDates.length === 0) return null
  const startDate = window[0]!
  return {
    playerId: player.id,
    startDate,
    endDate: window[window.length - 1]!,
    gameDates,
    tier: tierForWindow(gameDates, schedule.matchup.days),
    gamesInWindow: gameDates.length,
    remainingWeekGames: remainingWeekGames(player, startDate, schedule),
  }
}

export const blockFromDate = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
): StreamingBlock | null => {
  const days = schedule.matchup.days.filter((day) => day >= fromDate)
  return blockFromWindow(player, days.slice(0, 4), schedule)
}

export const findStreamingBlocks = (
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): StreamingBlock[] => {
  const days = schedule.matchup.days
  const raw: StreamingBlock[] = []
  for (const player of players) {
    for (let i = 0; i < days.length; i++) {
      const startDate = days[i]!
      if (!playsOn(player, startDate, schedule)) continue
      const block = blockFromWindow(player, days.slice(i, i + 4), schedule)
      if (block) raw.push(block)
    }
  }
  raw.sort((a, b) => {
    const tierDelta = densityTierRank(b.tier) - densityTierRank(a.tier)
    if (tierDelta !== 0) return tierDelta
    const gamesDelta = b.gamesInWindow - a.gamesInWindow
    if (gamesDelta !== 0) return gamesDelta
    const remainingDelta = b.remainingWeekGames - a.remainingWeekGames
    if (remainingDelta !== 0) return remainingDelta
    const playerDelta = a.playerId.localeCompare(b.playerId)
    if (playerDelta !== 0) return playerDelta
    return a.startDate.localeCompare(b.startDate)
  })
  const seen = new Set<string>()
  const deduped: StreamingBlock[] = []
  for (const block of raw) {
    const key = `${block.playerId}:${block.startDate}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(block)
  }
  return deduped
}
