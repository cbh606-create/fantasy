import { normalizeSeasonAvailability } from "@/lib/season/availability"
import type { SeasonLeagueState } from "@/lib/season/types"

export const youWaiverRank = (state: SeasonLeagueState): number => {
  const normalized = normalizeSeasonAvailability(state)
  const orderIndex = normalized.waiverOrder.indexOf(
    normalized.perspectiveTeamIndex,
  )

  if (orderIndex === -1) {
    return normalized.teams.length
  }

  return orderIndex + 1
}
