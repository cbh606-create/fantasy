import { defaultPositionsForSlot } from "@/lib/season/defaultPositions"
import { diversifyRosterTeamAbbrs } from "@/lib/season/diversifyTeamAbbrs"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonPosition,
  SeasonSlot,
} from "@/lib/season/types"

type SeasonAvailabilityInput = Omit<
  SeasonLeagueState,
  "availablePlayerIds" | "waiverOrder"
> &
  Partial<Pick<SeasonLeagueState, "availablePlayerIds" | "waiverOrder">>

const FULL_ELIGIBILITY: SeasonPosition[] = [
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
  "G",
  "F",
]

const FLEX_POSITION_CYCLE: SeasonPosition[][] = [
  ["PG", "G"],
  ["SG", "G"],
  ["SF", "F"],
  ["PF", "F"],
  ["C"],
  ["PG", "SG", "G"],
  ["SF", "PF", "F"],
]

const isFullEligibility = (positions: SeasonPosition[] | undefined) =>
  Boolean(
    positions?.length === FULL_ELIGIBILITY.length &&
      FULL_ELIGIBILITY.every((position) => positions.includes(position)),
  )

const positionsForSlot = (
  slot: SeasonSlot,
  flexIndex: number,
): SeasonPosition[] => {
  if (slot === "UTIL" || slot === "BE" || slot === "IL") {
    return FLEX_POSITION_CYCLE[flexIndex % FLEX_POSITION_CYCLE.length]
  }
  return defaultPositionsForSlot(slot)
}

const withPositionsFromRosterSlots = (
  state: SeasonAvailabilityInput,
): SeasonPlayer[] => {
  const slotByPlayerId = new Map<string, SeasonSlot>()
  const flexIndexByPlayerId = new Map<string, number>()
  let flexIndex = 0

  for (const team of state.teams) {
    for (const entry of team.entries) {
      if (!entry.playerId || slotByPlayerId.has(entry.playerId)) continue
      slotByPlayerId.set(entry.playerId, entry.slot)
      if (entry.slot === "UTIL" || entry.slot === "BE" || entry.slot === "IL") {
        flexIndexByPlayerId.set(entry.playerId, flexIndex)
        flexIndex += 1
      }
    }
  }

  let poolFlexIndex = 0

  return state.players.map((player) => {
    const slot = slotByPlayerId.get(player.id)

    if (!slot) {
      if (player.positions?.length && !isFullEligibility(player.positions)) {
        return player
      }
      const positions =
        FLEX_POSITION_CYCLE[poolFlexIndex % FLEX_POSITION_CYCLE.length]
      poolFlexIndex += 1
      return { ...player, positions }
    }

    const needsRefine =
      !player.positions?.length ||
      ((slot === "UTIL" || slot === "BE" || slot === "IL") &&
        isFullEligibility(player.positions))

    if (!needsRefine) return player

    return {
      ...player,
      positions: positionsForSlot(slot, flexIndexByPlayerId.get(player.id) ?? 0),
    }
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

  return diversifyRosterTeamAbbrs({
    ...state,
    players,
    availablePlayerIds: (state.availablePlayerIds ?? []).filter(
      (playerId) =>
        playerIds.has(playerId) && !rosteredPlayerIds.has(playerId),
    ),
    waiverOrder:
      state.waiverOrder ?? state.teams.map(({ teamIndex }) => teamIndex),
  })
}
