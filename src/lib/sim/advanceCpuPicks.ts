import { teamIndexForOverall } from "@/lib/domain/snake"
import type { DraftPick, LeagueState, Player } from "@/lib/domain/types"
import { createRng, pickSimOpponent } from "@/lib/sim/opponent"

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

/** Fill opponent picks until the next perspective-team turn (Mock / sim helpers). */
export const advanceCpuPicksUntilUserTurn = (
  state: LeagueState,
  seed = 1,
): LeagueState => {
  const picks = ensurePickSlots(state)
  const totalPicks = picks.length
  const playerById = new Map(state.players.map((player) => [player.id, player]))
  const rosters = Array.from(
    { length: state.settings.teams },
    () => [] as Player[],
  )
  const draftedPlayerIds = new Set<string>()

  for (const pick of picks) {
    if (!pick.playerId) continue

    const player = playerById.get(pick.playerId)
    if (!player) continue

    rosters[pick.teamIndex].push(player)
    draftedPlayerIds.add(player.id)
  }

  let remaining = state.players.filter(
    (player) => !draftedPlayerIds.has(player.id),
  )
  const rng = createRng(seed)
  let currentOverall = Math.max(1, state.board.currentOverall)

  while (currentOverall <= totalPicks) {
    const pick = picks[currentOverall - 1]

    if (pick.playerId) {
      currentOverall += 1
      continue
    }

    if (pick.teamIndex === state.perspectiveTeamIndex) {
      break
    }

    if (remaining.length === 0) {
      break
    }

    const selectedPlayer = pickSimOpponent(
      remaining,
      rosters[pick.teamIndex],
      rng,
    )

    pick.playerId = selectedPlayer.id
    rosters[pick.teamIndex].push(selectedPlayer)
    remaining = remaining.filter((player) => player.id !== selectedPlayer.id)
    currentOverall += 1
  }

  return {
    ...state,
    board: {
      picks,
      currentOverall,
    },
  }
}
