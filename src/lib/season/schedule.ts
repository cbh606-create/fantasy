import { formatPlayerPositions } from "@/lib/season/slotLabels"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

export type OpponentLabel = string

export type PlayerScheduleRow = {
  slot: SeasonSlot
  playerId: string | null
  name: string
  positions: string
  teamAbbr: string | null
  teamUnknown: boolean
  games: number | null
  cells: Record<string, OpponentLabel[]>
}

type BuildArgs = {
  entries: SeasonRosterEntry[]
  players: SeasonPlayer[]
  schedule: ScheduleResponse
}

const emptyCells = (days: string[]): Record<string, OpponentLabel[]> =>
  Object.fromEntries(days.map((day) => [day, [] as OpponentLabel[]]))

export const buildPlayerMatchupSchedule = ({
  entries,
  players,
  schedule,
}: BuildArgs): PlayerScheduleRow[] => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const days = schedule.matchup.days

  return entries.map((entry) => {
    const baseCells = emptyCells(days)

    if (!entry.playerId) {
      return {
        slot: entry.slot,
        playerId: null,
        name: "Empty",
        positions: "—",
        teamAbbr: null,
        teamUnknown: false,
        games: null,
        cells: baseCells,
      }
    }

    const player = playersById.get(entry.playerId)
    const teamAbbr = player?.teamAbbr?.toUpperCase() ?? null
    const teamUnknown = !teamAbbr
    const cells = emptyCells(days)

    if (teamAbbr) {
      for (const game of schedule.games) {
        if (!days.includes(game.date)) continue
        if (game.homeAbbr.toUpperCase() === teamAbbr) {
          cells[game.date].push(`vs ${game.awayAbbr.toUpperCase()}`)
        } else if (game.awayAbbr.toUpperCase() === teamAbbr) {
          cells[game.date].push(`@${game.homeAbbr.toUpperCase()}`)
        }
      }
    }

    const games = teamUnknown
      ? 0
      : days.filter((day) => cells[day].length > 0).length

    return {
      slot: entry.slot,
      playerId: entry.playerId,
      name: player?.name ?? "Unknown",
      positions: formatPlayerPositions(player),
      teamAbbr,
      teamUnknown,
      games,
      cells,
    }
  })
}
