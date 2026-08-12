import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { ASSUMED_SEASON_GAMES, isActiveSlot } from "./constants"
import type { WeeklyPlayerStats } from "./types"

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

const emptyTotals = (): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as Record<CategoryId, number>

export const weeklyPlayerStats = (
  player: SeasonPlayer,
  games: number,
): WeeklyPlayerStats => {
  const factor = games / ASSUMED_SEASON_GAMES
  const projections = {} as Record<CategoryId, number>

  for (const categoryId of COUNTING_CATEGORIES) {
    projections[categoryId] = player.projections[categoryId] * factor
  }

  const shooting = {
    FGM: player.shooting.FGM * factor,
    FGA: player.shooting.FGA * factor,
    FTM: player.shooting.FTM * factor,
    FTA: player.shooting.FTA * factor,
  }

  projections.FG_PCT = shooting.FGA > 0 ? shooting.FGM / shooting.FGA : 0
  projections.FT_PCT = shooting.FTA > 0 ? shooting.FTM / shooting.FTA : 0

  return { projections, shooting }
}

export const activeTeamWeeklyTotals = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  gamesMap: Map<string, number>,
): Record<CategoryId, number> => {
  const totals = emptyTotals()
  let totalFGM = 0
  let totalFGA = 0
  let totalFTM = 0
  let totalFTA = 0

  for (const entry of entries) {
    if (!isActiveSlot(entry.slot) || !entry.playerId) continue

    const player = playersById.get(entry.playerId)
    if (!player) continue

    const games = gamesMap.get(entry.playerId) ?? 0
    const weekly = weeklyPlayerStats(player, games)

    for (const categoryId of COUNTING_CATEGORIES) {
      totals[categoryId] += weekly.projections[categoryId]
    }

    totalFGM += weekly.shooting.FGM
    totalFGA += weekly.shooting.FGA
    totalFTM += weekly.shooting.FTM
    totalFTA += weekly.shooting.FTA
  }

  totals.FG_PCT = totalFGA > 0 ? totalFGM / totalFGA : 0
  totals.FT_PCT = totalFTA > 0 ? totalFTM / totalFTA : 0

  return totals
}
