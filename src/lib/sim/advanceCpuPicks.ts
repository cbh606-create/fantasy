import { teamIndexForOverall } from "@/lib/domain/snake"
import type { DraftPick, LeagueState, Player } from "@/lib/domain/types"
import { createRng, pickMockCpu } from "@/lib/sim/opponent"

const ensurePickSlots = (state: LeagueState): DraftPick[] => {
  const { teams, rounds } = state.settings
  const totalPicks = teams * rounds
  const picksByOverall = new Map(
    state.board.picks.map((pick) => [pick.overall, { ...pick }]),
  )

  for (let overall = 1; overall <= totalPicks; overall++) {
    if (picksByOverall.has(overall)) continue

    picksByOverall.set(overall, {
      overall,
      round: Math.ceil(overall / teams),
      teamIndex: teamIndexForOverall(overall, teams),
      playerId: null,
    })
  }

  return Array.from(picksByOverall.values()).sort(
    (left, right) => left.overall - right.overall,
  )
}

const remainingPlayers = (state: LeagueState, picks: DraftPick[]) => {
  const draftedPlayerIds = new Set(
    picks.flatMap((pick) => (pick.playerId ? [pick.playerId] : [])),
  )

  return state.players.filter((player) => !draftedPlayerIds.has(player.id))
}

const rosterForTeam = (
  picks: DraftPick[],
  players: Player[],
  teamIndex: number,
): Player[] => {
  const byId = new Map(players.map((player) => [player.id, player]))

  return picks.flatMap((pick) => {
    if (pick.teamIndex !== teamIndex || !pick.playerId) return []
    const player = byId.get(pick.playerId)
    return player ? [player] : []
  })
}

/** Apply a single opponent CPU pick. Returns null when it is the user turn or done. */
export const advanceOneCpuPick = (
  state: LeagueState,
  seed = 1,
): LeagueState | null => {
  const picks = ensurePickSlots(state)
  const totalPicks = picks.length
  let currentOverall = Math.max(1, state.board.currentOverall)

  while (currentOverall <= totalPicks && picks[currentOverall - 1]?.playerId) {
    currentOverall += 1
  }

  if (currentOverall > totalPicks) {
    return null
  }

  const pick = picks[currentOverall - 1]
  if (pick.teamIndex === state.perspectiveTeamIndex) {
    return null
  }

  const remaining = remainingPlayers(state, picks)
  if (remaining.length === 0) {
    return null
  }

  const roster = rosterForTeam(picks, state.players, pick.teamIndex)
  const selectedPlayer = pickMockCpu(remaining, roster, createRng(seed))

  pick.playerId = selectedPlayer.id

  return {
    ...state,
    board: {
      picks,
      currentOverall: currentOverall + 1,
    },
  }
}

/** Fill opponent picks until the next perspective-team turn (sync helper / tests). */
export const advanceCpuPicksUntilUserTurn = (
  state: LeagueState,
  seed = 1,
): LeagueState => {
  let current = state
  let step = 0

  while (true) {
    const next = advanceOneCpuPick(current, seed + step)
    if (!next) {
      const picks = ensurePickSlots(current)
      let currentOverall = Math.max(1, current.board.currentOverall)
      while (
        currentOverall <= picks.length &&
        picks[currentOverall - 1]?.playerId
      ) {
        currentOverall += 1
      }

      return {
        ...current,
        board: {
          picks,
          currentOverall,
        },
      }
    }

    current = next
    step += 1
  }
}
