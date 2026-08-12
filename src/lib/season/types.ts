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
  teamAbbr?: string
  availability?: "fa" | "waiver"
  projections: Record<CategoryId, number>
  shooting: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

export type ScheduleGame = {
  date: string
  homeAbbr: string
  awayAbbr: string
}

export type ScheduleMatchup = {
  scoringPeriodId: number
  startDate: string
  endDate: string
  days: string[]
}

export type ScheduleResponse = {
  source: "fixture"
  matchup: ScheduleMatchup
  games: ScheduleGame[]
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
  availablePlayerIds: string[]
  waiverOrder: number[]
  source: "espn" | "manual" | "mixed"
  lastSyncedAt?: string
  localLineup?: SeasonRosterEntry[] | null
}
