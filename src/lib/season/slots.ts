import type { SeasonRosterEntry, SeasonSlot } from "./types"

export const SEASON_ROSTER_SLOTS: SeasonSlot[] = [
  "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL",
  "BE", "BE", "BE", "IL",
]

export const buildEmptyTeamEntries = (): SeasonRosterEntry[] =>
  SEASON_ROSTER_SLOTS.map((slot) => ({ slot, playerId: null }))
