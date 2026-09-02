import { db } from "@/lib/db"
import { normalizeSeasonAvailability } from "@/lib/season/availability"
import { applyLocalLineup } from "@/lib/season/lineup"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"

export type LoadedSeasonLeague = {
  id: string
  espnLeagueId: string | null
  state: SeasonLeagueState
}

export const loadOwnedSeasonLeague = async (
  seasonLeagueId: string,
  userId: string,
): Promise<LoadedSeasonLeague | "not_found" | "invalid_state"> => {
  const league = await db.seasonLeague.findFirst({
    where: { id: seasonLeagueId, clerkUserId: userId },
  })

  if (!league) {
    return "not_found"
  }

  let state: SeasonLeagueState
  let localLineup: SeasonRosterEntry[] | null

  try {
    state = JSON.parse(league.stateJson) as SeasonLeagueState
    localLineup = league.localLineupJson
      ? (JSON.parse(league.localLineupJson) as SeasonRosterEntry[])
      : null
  } catch {
    return "invalid_state"
  }

  return {
    id: league.id,
    espnLeagueId: league.espnLeagueId,
    state: normalizeSeasonAvailability(applyLocalLineup(state, localLineup)),
  }
}
