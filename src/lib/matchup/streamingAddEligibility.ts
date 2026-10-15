import { playerHasGameOnDate } from "@/lib/matchup/games"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

/**
 * Active NBA roster footprint for this season.
 * Stale teamAbbr alone is not enough (retired players can keep a last team).
 */
export const isOnNbaRosterThisSeason = (
  player: Pick<SeasonPlayer, "teamAbbr" | "projectedGames">,
): boolean => {
  if (!player.teamAbbr) return false
  return (
    typeof player.projectedGames === "number" && player.projectedGames > 0
  )
}

/** Eligible to recommend / pick as a stream add on this date. */
export const isStreamAddEligibleOnDate = (
  player: Pick<
    SeasonPlayer,
    "id" | "name" | "teamAbbr" | "injuryStatus" | "projectedGames"
  >,
  date: string,
  schedule: ScheduleResponse,
): boolean => {
  if (!isOnNbaRosterThisSeason(player)) return false
  return playerHasGameOnDate(player, date, schedule)
}

export const filterStreamAddEligibleOnDate = <T extends SeasonPlayer>(
  players: readonly T[],
  date: string,
  schedule: ScheduleResponse,
): T[] =>
  players.filter((player) => isStreamAddEligibleOnDate(player, date, schedule))

/** Pool for block search: on an NBA roster this season (date eligibility is per start day). */
export const filterStreamAddPool = <T extends SeasonPlayer>(
  players: readonly T[],
): T[] => players.filter((player) => isOnNbaRosterThisSeason(player))
