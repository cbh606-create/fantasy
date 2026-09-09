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

export type SeasonPosition = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F"

export type SeasonPlayer = {
  id: string
  name: string
  teamAbbr?: string
  positions?: SeasonPosition[]
  availability?: "fa" | "waiver"
  projections: Record<CategoryId, number>
  /** ESPN (or overlay) projected games; used for weekly scaling when set. */
  projectedGames?: number
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
  source: "live" | "season" | "fixture"
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
  espnTeamId?: number
  teams: SeasonTeamRoster[]
  players: SeasonPlayer[]
  availablePlayerIds: string[]
  waiverOrder: number[]
  /** Matchup days a dropped player stays on waivers. Unset → planner default (2). */
  waiverPeriodDays?: number
  rosterSlots?: SeasonSlot[]
  source: "espn" | "manual" | "mixed"
  lastSyncedAt?: string
  localLineup?: SeasonRosterEntry[] | null
}
