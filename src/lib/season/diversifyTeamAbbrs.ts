import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

/** Prefer teams that appear in demo/published schedule weeks, then the rest of the NBA. */
const PREFERRED_TEAM_ABBRS = [
  "BOS",
  "LAL",
  "NYK",
  "MIA",
  "MIL",
  "DEN",
  "GSW",
  "OKC",
  "PHX",
  "DAL",
  "CLE",
  "MIN",
  "PHI",
  "ATL",
  "CHI",
  "HOU",
  "SAS",
  "TOR",
  "BKN",
  "CHA",
  "DET",
  "IND",
  "LAC",
  "MEM",
  "NOP",
  "ORL",
  "POR",
  "SAC",
  "UTA",
  "WAS",
] as const

/**
 * Within each fantasy roster, ensure rostered players have unique NBA teamAbbrs.
 * Demo/manual leagues often reused a short cycle (BOS/LAL/…) so schedule + daily
 * lineups looked stacked on the same clubs. Real ESPN imports are left alone.
 */
export const diversifyRosterTeamAbbrs = (
  state: SeasonLeagueState,
): SeasonLeagueState => {
  if (state.source !== "manual" && state.source !== "mixed") {
    return state
  }

  const playersById = new Map(
    state.players.map((player) => [player.id, { ...player }]),
  )
  let changed = false

  for (const team of state.teams) {
    const used = new Set<string>()

    for (const entry of team.entries) {
      if (!entry.playerId) continue

      const player = playersById.get(entry.playerId)
      if (!player) continue

      const current = player.teamAbbr?.toUpperCase()
      if (current && !used.has(current)) {
        used.add(current)
        if (player.teamAbbr !== current) {
          player.teamAbbr = current
          changed = true
        }
        continue
      }

      const nextAbbr = PREFERRED_TEAM_ABBRS.find((abbr) => !used.has(abbr))
      if (!nextAbbr) continue

      used.add(nextAbbr)
      if (player.teamAbbr !== nextAbbr) {
        player.teamAbbr = nextAbbr
        changed = true
      }
    }
  }

  if (!changed) return state

  return {
    ...state,
    players: state.players.map((player) => playersById.get(player.id) ?? player),
  }
}
