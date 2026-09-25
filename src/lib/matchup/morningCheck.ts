import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import { isActiveSlot } from "./constants"
import { gameWeightForTeamDate, teamHasGameOnDate } from "./games"
import type { StatWindow } from "./types"
import { weeklyPlayerStats } from "./weekly"

export type CategoryTotals = Record<CategoryId, number>

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

export const emptyCategoryTotals = (): CategoryTotals =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryTotals

export const startableIdsOnDate = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
): string[] =>
  entries.flatMap((entry) => {
    if (!isActiveSlot(entry.slot) || !entry.playerId) return []
    const player = playersById.get(entry.playerId)
    if (!player?.teamAbbr) return []
    if (!teamHasGameOnDate(player.teamAbbr, date, schedule)) return []
    return [entry.playerId]
  })

export const projectDayTotals = (
  playerIds: string[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): CategoryTotals => {
  const totals = emptyCategoryTotals()
  let fgm = 0
  let fga = 0
  let ftm = 0
  let fta = 0

  for (const playerId of playerIds) {
    const player = playersById.get(playerId)
    if (!player?.teamAbbr) continue
    const games = gameWeightForTeamDate(
      player.teamAbbr,
      date,
      schedule,
      undefined,
      playerId,
    )
    if (games <= 0) continue
    const weekly = weeklyPlayerStats(player, games, statWindow)
    for (const categoryId of COUNTING_CATEGORIES) {
      totals[categoryId] += weekly.projections[categoryId]
    }
    fgm += weekly.shooting.FGM
    fga += weekly.shooting.FGA
    ftm += weekly.shooting.FTM
    fta += weekly.shooting.FTA
  }

  totals.FG_PCT = fga > 0 ? fgm / fga : 0
  totals.FT_PCT = fta > 0 ? ftm / fta : 0
  return totals
}
