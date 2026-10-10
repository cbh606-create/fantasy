import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

type CategoryStats = Record<CategoryId, {
  mean: number
  deviation: number
}>

const categoryStats = (leaguePlayers: SeasonPlayer[]): CategoryStats =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => {
      const values = leaguePlayers.map(
        (player) => player.projections[categoryId],
      )
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const deviation = Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
          / values.length,
      )

      return [categoryId, { mean, deviation }]
    }),
  ) as CategoryStats

const valueFromStats = (player: SeasonPlayer, stats: CategoryStats): number =>
  ALL_CATEGORY_IDS.reduce((total, categoryId) => {
    const { mean, deviation } = stats[categoryId]

    if (deviation === 0) {
      return total
    }

    const z = (player.projections[categoryId] - mean) / deviation
    return total + (categoryId === "TO" ? -z : z)
  }, 0)

export const playerValue = (
  player: SeasonPlayer,
  leaguePlayers: SeasonPlayer[],
): number => valueFromStats(player, categoryStats(leaguePlayers))

export const buildPlayerValueMap = (
  state: SeasonLeagueState,
): Map<string, number> => {
  const stats = categoryStats(state.players)

  return new Map(
    state.players.map((player) => [player.id, valueFromStats(player, stats)]),
  )
}
