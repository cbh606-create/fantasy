import { defaultCategorySettings } from "@/lib/domain/categories"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
  SeasonTeamRoster,
} from "@/lib/season/types"
import { EspnAdapterError } from "./errors"

const PRO_TEAM_ABBR: Record<number, string> = {
  1: "ATL",
  2: "BOS",
  3: "NOP",
  4: "CHI",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GSW",
  10: "HOU",
  11: "IND",
  12: "LAC",
  13: "LAL",
  14: "MIA",
  15: "MIL",
  16: "MIN",
  17: "BKN",
  18: "NYK",
  19: "ORL",
  20: "PHI",
  21: "PHX",
  22: "POR",
  23: "SAC",
  24: "SAS",
  25: "OKC",
  26: "UTA",
  27: "WAS",
  28: "TOR",
  29: "MEM",
  30: "CHA",
}

type EspnAverageStats = Record<string, number>

type EspnPlayerStats = {
  seasonId?: number
  statSourceId?: number
  statSplitTypeId?: number
  averageStats?: EspnAverageStats
  stats?: EspnAverageStats
}

type EspnPlayer = {
  id: number
  fullName?: string
  proTeamId?: number
  stats?: EspnPlayerStats[]
}

type EspnRosterEntry = {
  lineupSlotId?: number
  playerPoolEntry?: {
    player?: EspnPlayer
  }
}

type EspnTeam = {
  id: number
  abbrev?: string
  location?: string
  nickname?: string
  roster?: {
    entries?: EspnRosterEntry[]
  }
}

export type EspnLeaguePayload = {
  id?: number
  seasonId?: number
  settings?: { name?: string }
  teams?: EspnTeam[]
}

export const mapEspnLineupSlot = (lineupSlotId: number): SeasonSlot => {
  switch (lineupSlotId) {
    case 0:
      return "PG"
    case 1:
      return "SG"
    case 2:
      return "SF"
    case 3:
      return "PF"
    case 4:
      return "C"
    case 5:
      return "G"
    case 6:
      return "F"
    case 11:
      return "UTIL"
    case 12:
      return "BE"
    case 13:
      return "IL"
    case 7:
    case 8:
    case 9:
    case 10:
      return "UTIL"
    default:
      return "BE"
  }
}

const pickAverageStats = (
  player: EspnPlayer,
  season: number,
): EspnAverageStats => {
  const stats = player.stats ?? []
  const preferred =
    stats.find(
      (row) =>
        row.seasonId === season &&
        row.statSourceId === 0 &&
        row.statSplitTypeId === 0 &&
        row.averageStats,
    ) ??
    stats.find((row) => row.averageStats) ??
    stats[0]

  return preferred?.averageStats ?? preferred?.stats ?? {}
}

const playerFromEspn = (player: EspnPlayer, season: number): SeasonPlayer => {
  const avg = pickAverageStats(player, season)
  const fgm = avg["13"] ?? 0
  const fga = avg["14"] ?? 0
  const ftm = avg["15"] ?? 0
  const fta = avg["16"] ?? 0

  return {
    id: String(player.id),
    name: player.fullName?.trim() || `Player ${player.id}`,
    teamAbbr: PRO_TEAM_ABBR[player.proTeamId ?? -1],
    projections: {
      FG_PCT: avg["19"] ?? (fga > 0 ? fgm / fga : 0),
      FT_PCT: avg["20"] ?? (fta > 0 ? ftm / fta : 0),
      TPM: avg["17"] ?? 0,
      REB: avg["6"] ?? 0,
      AST: avg["3"] ?? 0,
      STL: avg["2"] ?? 0,
      BLK: avg["1"] ?? 0,
      TO: avg["11"] ?? 0,
      PTS: avg["0"] ?? 0,
    },
    shooting: {
      FGM: fgm,
      FGA: fga,
      FTM: ftm,
      FTA: fta,
    },
  }
}

const packEntries = (raw: { slot: SeasonSlot; playerId: string }[]): SeasonRosterEntry[] => {
  const queues = new Map<SeasonSlot, string[]>()
  for (const slot of SEASON_ROSTER_SLOTS) {
    if (!queues.has(slot)) queues.set(slot, [])
  }

  for (const entry of raw) {
    queues.get(entry.slot)?.push(entry.playerId)
  }

  return SEASON_ROSTER_SLOTS.map((slot) => ({
    slot,
    playerId: queues.get(slot)?.shift() ?? null,
  }))
}

const teamName = (team: EspnTeam): string => {
  const combined = [team.location, team.nickname].filter(Boolean).join(" ").trim()
  if (combined) return combined
  if (team.abbrev?.trim()) return team.abbrev.trim()
  return `Team ${team.id}`
}

export const mapEspnLeagueToSeasonState = (
  payload: EspnLeaguePayload,
  params: { leagueId: string; season: number; teamId: number },
): SeasonLeagueState => {
  const teamsPayload = payload.teams ?? []
  if (teamsPayload.length === 0) {
    throw new EspnAdapterError("ESPN_PARTIAL")
  }

  const perspectiveIndex = teamsPayload.findIndex((team) => team.id === params.teamId)
  if (perspectiveIndex < 0) {
    throw new EspnAdapterError("ESPN_PARTIAL")
  }

  const playersById = new Map<string, SeasonPlayer>()
  const teams: SeasonTeamRoster[] = teamsPayload.map((team, teamIndex) => {
    const rawEntries: { slot: SeasonSlot; playerId: string }[] = []

    for (const entry of team.roster?.entries ?? []) {
      const player = entry.playerPoolEntry?.player
      if (!player?.id || entry.lineupSlotId === undefined) continue

      const seasonPlayer = playerFromEspn(player, params.season)
      playersById.set(seasonPlayer.id, seasonPlayer)
      rawEntries.push({
        slot: mapEspnLineupSlot(entry.lineupSlotId),
        playerId: seasonPlayer.id,
      })
    }

    return {
      teamIndex,
      name: teamName(team),
      entries: packEntries(rawEntries),
    }
  })

  const season = payload.seasonId ?? params.season
  const name = payload.settings?.name?.trim() || `ESPN League ${params.leagueId}`

  return {
    id: params.leagueId,
    name,
    season,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: perspectiveIndex,
    espnTeamId: params.teamId,
    teams,
    players: [...playersById.values()],
    availablePlayerIds: [],
    waiverOrder: teams.map((team) => team.teamIndex),
    source: "espn",
  }
}
