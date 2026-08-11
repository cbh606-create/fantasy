import type { CategoryId, CategorySetting } from "@/lib/domain/types"

export type SeasonSlot =
  | "PG"
  | "SG"
  | "SF"
  | "PF"
  | "C"
  | "G"
  | "F"
  | "UTIL"
  | "BE"
  | "IL"

export type SeasonPlayer = {
  id: string
  name: string
  projections: Record<CategoryId, number>
  shooting: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

export type SeasonRosterEntry = {
  slot: SeasonSlot
  playerId: string | null
}

export type SeasonTeamRoster = {
  teamIndex: number
  name: string
  entries: SeasonRosterEntry[]
}

export type SeasonLeagueState = {
  id?: string
  name: string
  season: number
  categories: CategorySetting[]
  perspectiveTeamIndex: number
  teams: SeasonTeamRoster[]
  players: SeasonPlayer[]
  source: "espn" | "manual" | "mixed"
  lastSyncedAt?: string
  localLineup?: SeasonRosterEntry[] | null
}
