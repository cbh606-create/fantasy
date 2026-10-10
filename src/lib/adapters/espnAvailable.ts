import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

export const rosteredPlayerIds = (state: SeasonLeagueState): Set<string> => {
  const ids = new Set<string>()
  for (const team of state.teams) {
    for (const entry of team.entries) {
      if (entry.playerId) ids.add(entry.playerId)
    }
  }
  return ids
}

export const deriveAvailableFromOwnership = (
  state: SeasonLeagueState,
): string[] => {
  const rostered = rosteredPlayerIds(state)
  return state.players
    .map((player) => player.id)
    .filter((id) => !rostered.has(id))
}

export const mergeAvailablePlayers = (
  state: SeasonLeagueState,
  available: SeasonPlayer[],
  _source: "espn_fa" | "ownership",
): SeasonLeagueState => {
  const rostered = rosteredPlayerIds(state)
  const byId = new Map(state.players.map((player) => [player.id, player]))

  for (const player of available) {
    if (rostered.has(player.id)) continue
    const existing = byId.get(player.id)
    byId.set(player.id, {
      ...existing,
      ...player,
      availability:
        player.availability ?? existing?.availability ?? "fa",
    })
  }

  const availablePlayerIds = available
    .map((player) => player.id)
    .filter((id) => !rostered.has(id))

  return {
    ...state,
    players: [...byId.values()],
    availablePlayerIds,
  }
}
