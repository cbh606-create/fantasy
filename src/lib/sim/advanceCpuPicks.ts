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

const buildRostersAndRemaining = (state: LeagueState, picks: DraftPick[]) => {
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

  const remaining = state.players.filter(
    (player) => !draftedPlayerIds.has(player.id),
  )

  return { rosters, remaining }
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

  const { rosters, remaining } = buildRostersAndRemaining(state, picks)
  if (remaining.length === 0) {
    return null
  }

  const selectedPlayer = pickSimOpponent(
    remaining,
    rosters[pick.teamIndex],
    createRng(seed),
  )

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
