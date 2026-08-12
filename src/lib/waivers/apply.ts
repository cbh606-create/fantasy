import { normalizeSeasonAvailability } from "@/lib/season/availability"
import type { SeasonLeagueState } from "@/lib/season/types"
import type { AddDropError, AddDropInput } from "./types"

export const applyAddDrop = (
  state: SeasonLeagueState,
  input: AddDropInput,
): SeasonLeagueState | AddDropError => {
  const normalized = normalizeSeasonAvailability(state)
  const { addPlayerId, dropPlayerId } = input
  const youIndex = normalized.perspectiveTeamIndex
  const youTeam = normalized.teams.find((team) => team.teamIndex === youIndex)

  if (!youTeam) {
    return { error: "perspective_team_not_found" }
  }

  if (!normalized.availablePlayerIds.includes(addPlayerId)) {
    return { error: "add_not_available" }
  }

  if (dropPlayerId !== null) {
    const dropOnYou = youTeam.entries.some(
      (entry) => entry.playerId === dropPlayerId,
    )

    if (!dropOnYou) {
      return { error: "drop_not_on_roster" }
    }
  } else if (!youTeam.entries.some((entry) => entry.playerId === null)) {
    return { error: "no_empty_slot" }
  }

  let filledEmptySlot = false
  const nextTeams = normalized.teams.map((team) => {
    if (team.teamIndex !== youIndex) {
      return team
    }

    return {
      ...team,
      entries: team.entries.map((entry) => {
        if (dropPlayerId !== null && entry.playerId === dropPlayerId) {
          return { ...entry, playerId: addPlayerId }
        }

        if (
          dropPlayerId === null &&
          entry.playerId === null &&
          !filledEmptySlot
        ) {
          filledEmptySlot = true
          return { ...entry, playerId: addPlayerId }
        }

        return entry
      }),
    }
  })

  const nextAvailablePlayerIds = normalized.availablePlayerIds.filter(
    (playerId) => playerId !== addPlayerId,
  )

  if (dropPlayerId !== null) {
    nextAvailablePlayerIds.push(dropPlayerId)
  }

  const nextPlayers = normalized.players.map((player) => {
    if (dropPlayerId !== null && player.id === dropPlayerId) {
      return { ...player, availability: "fa" as const }
    }

    return player
  })

  return normalizeSeasonAvailability({
    ...normalized,
    teams: nextTeams,
    players: nextPlayers,
    availablePlayerIds: nextAvailablePlayerIds,
  })
}
