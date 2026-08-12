import { ALL_CATEGORY_IDS, effectiveWeights } from "@/lib/domain/categories"
import { teamIndexForOverall } from "@/lib/domain/snake"
import type {
  CategoryId,
  DraftPick,
  LeagueState,
  Player,
} from "@/lib/domain/types"
import { createRng, pickOpponentPlayer } from "@/lib/sim/opponent"

type CategoryValues = Record<CategoryId, number>

const emptyCategoryValues = (): CategoryValues =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryValues

const averagePlayerProjections = (players: Player[]): CategoryValues => {
  const averages = emptyCategoryValues()

  if (players.length === 0) {
    return averages
  }

  for (const player of players) {
    for (const categoryId of ALL_CATEGORY_IDS) {
      averages[categoryId] += player.projections[categoryId] / players.length
    }
  }

  return averages
}

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
  const weights = effectiveWeights(
    state.settings.categories,
    state.settings.puntCategoryIds,
    state.settings.focusCategoryIds,
  )
  const leagueAvg = averagePlayerProjections(state.players)
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

    const selectedPlayer = pickOpponentPlayer(
      remaining,
      rosters[pick.teamIndex],
      weights,
      leagueAvg,
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
