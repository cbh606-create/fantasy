import { normalizeNbaTeamAbbr } from "@/lib/nba/teamAbbr"
import type { SeasonLeagueState } from "@/lib/season/types"

/**
 * Canonicalize NBA team abbreviations so GS/GSW (and other ESPN shorts)
 * attach to the same published schedule. Do not invent a different team
 * for teammates — two BOS players must both keep BOS.
 */
export const diversifyRosterTeamAbbrs = (
  state: SeasonLeagueState,
): SeasonLeagueState => {
  let changed = false
  const players = state.players.map((player) => {
    if (!player.teamAbbr) return player
    const teamAbbr = normalizeNbaTeamAbbr(player.teamAbbr)
    if (teamAbbr === player.teamAbbr) return player
    changed = true
    return { ...player, teamAbbr }
  })

  if (!changed) return state
  return { ...state, players }
}
