import { defaultPositionsForSlot } from "@/lib/season/defaultPositions"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

type SeasonAvailabilityInput = Omit<
  SeasonLeagueState,
  "availablePlayerIds" | "waiverOrder"
> &
  Partial<Pick<SeasonLeagueState, "availablePlayerIds" | "waiverOrder">>

const withPositionsFromRosterSlots = (
  state: SeasonAvailabilityInput,
): SeasonPlayer[] => {
  const positionsByPlayerId = new Map<string, SeasonPlayer["positions"]>()

  for (const team of state.teams) {
    for (const entry of team.entries) {
      if (!entry.playerId || positionsByPlayerId.has(entry.playerId)) continue
      positionsByPlayerId.set(entry.playerId, defaultPositionsForSlot(entry.slot))
    }
  }

  return state.players.map((player) => {
    if (player.positions?.length) return player
    const fromSlot = positionsByPlayerId.get(player.id)
    if (!fromSlot?.length) return player
    return { ...player, positions: fromSlot }
  })
}

export const normalizeSeasonAvailability = (
  state: SeasonAvailabilityInput,
): SeasonLeagueState => {
  const players = withPositionsFromRosterSlots(state)
  const playerIds = new Set(players.map(({ id }) => id))
  const rosteredPlayerIds = new Set(
    state.teams.flatMap(({ entries }) =>
      entries.flatMap(({ playerId }) => (playerId ? [playerId] : [])),
    ),
  )

  return {
    ...state,
    players,
    availablePlayerIds: (state.availablePlayerIds ?? []).filter(
      (playerId) =>
        playerIds.has(playerId) && !rosteredPlayerIds.has(playerId),
    ),
    waiverOrder:
      state.waiverOrder ?? state.teams.map(({ teamIndex }) => teamIndex),
  }
}
