import type { SeasonLeagueState } from "@/lib/season/types"

type SeasonAvailabilityInput = Omit<
  SeasonLeagueState,
  "availablePlayerIds" | "waiverOrder"
> &
  Partial<Pick<SeasonLeagueState, "availablePlayerIds" | "waiverOrder">>

export const normalizeSeasonAvailability = (
  state: SeasonAvailabilityInput,
): SeasonLeagueState => {
  const playerIds = new Set(state.players.map(({ id }) => id))
  const rosteredPlayerIds = new Set(
    state.teams.flatMap(({ entries }) =>
      entries.flatMap(({ playerId }) => (playerId ? [playerId] : [])),
    ),
  )

  return {
    ...state,
    availablePlayerIds: (state.availablePlayerIds ?? []).filter(
      (playerId) =>
        playerIds.has(playerId) && !rosteredPlayerIds.has(playerId),
    ),
    waiverOrder:
      state.waiverOrder ?? state.teams.map(({ teamIndex }) => teamIndex),
  }
}
