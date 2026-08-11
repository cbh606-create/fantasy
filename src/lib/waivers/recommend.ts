import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { teamNeedsAndSurplus } from "@/lib/trade/needs"
import { MAX_RECOMMENDATIONS } from "./constants"
import type { PickupRecommendation } from "./types"

const needCategoryZ = (
  player: SeasonPlayer,
  categoryId: CategoryId,
  leaguePlayers: SeasonPlayer[],
): number => {
  const values = leaguePlayers.map((candidate) => candidate.projections[categoryId])
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const deviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  )

  if (deviation === 0) {
    return 0
  }

  const z = (player.projections[categoryId] - mean) / deviation

  return categoryId === "TO" ? -z : z
}

const scorePlayerForNeeds = (
  player: SeasonPlayer,
  needCategories: CategoryId[],
  leaguePlayers: SeasonPlayer[],
): { score: number; helpedCategories: CategoryId[] } => {
  if (needCategories.length === 0) {
    return { score: 0, helpedCategories: [] }
  }

  const contributions = needCategories.map((categoryId) => ({
    categoryId,
    z: needCategoryZ(player, categoryId, leaguePlayers),
  }))

  const helpedCategories = contributions
    .filter(({ z }) => z > 0)
    .sort((left, right) => right.z - left.z)
    .map(({ categoryId }) => categoryId)

  const score = contributions.reduce(
    (sum, { z }) => sum + Math.max(0, z),
    0,
  )

  return { score, helpedCategories }
}

const buildReasons = (helpedCategories: CategoryId[]): string[] => {
  if (helpedCategories.length === 0) {
    return ["Available pickup"]
  }

  return [`Helps ${helpedCategories.join(", ")}`]
}

export const recommendPickups = (
  state: SeasonLeagueState,
): PickupRecommendation[] => {
  const analysis = analyzeSeasonLeague(state)
  const needCategories = teamNeedsAndSurplus(
    analysis,
    state.perspectiveTeamIndex,
  ).need
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.availablePlayerIds
    .flatMap((playerId) => {
      const player = playersById.get(playerId)

      if (!player) {
        return []
      }

      const { score, helpedCategories } = scorePlayerForNeeds(
        player,
        needCategories,
        state.players,
      )

      return [{
        playerId,
        score,
        reasons: buildReasons(helpedCategories),
      }]
    })
    .sort((left, right) =>
      right.score - left.score || left.playerId.localeCompare(right.playerId))
    .slice(0, MAX_RECOMMENDATIONS)
}
