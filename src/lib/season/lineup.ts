import type { SeasonLeagueState, SeasonRosterEntry } from "./types"

export const applyLocalLineup = (
  state: SeasonLeagueState,
  localLineup: SeasonRosterEntry[] | null,
): SeasonLeagueState => {
  if (!localLineup) return state

  return {
    ...state,
    localLineup,
    teams: state.teams.map((team) =>
      team.teamIndex === state.perspectiveTeamIndex
        ? { ...team, entries: localLineup }
        : team,
    ),
  }
}
