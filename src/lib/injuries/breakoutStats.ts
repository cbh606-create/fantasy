import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export type EspnStatRow = {
  id?: string
  seasonId?: number
  statSourceId?: number
  statSplitTypeId?: number
  averageStats?: Record<string, number>
  stats?: Record<string, number>
}

export type RateLine = {
  gamesPlayed: number
  minutesPerGame: number | null
  rates: Record<CategoryId, number> | null
}

export type BreakoutStatLines = {
  seasonGames: number | null
  season: RateLine | null
  last7: RateLine | null
  projection: RateLine | null
}

const MINUTES = "40"
const GAMES = "42"

const numberAt = (
  stats: Record<string, number> | undefined,
  key: string,
): number | null => {
  const value = stats?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const findRow = (
  rows: readonly EspnStatRow[],
  seasonId: number,
  sourceId: number,
  splitId: number,
): EspnStatRow | undefined =>
  rows.find(
    (row) =>
      row.seasonId === seasonId &&
      row.statSourceId === sourceId &&
      row.statSplitTypeId === splitId,
  )

const minutesPerGame = (row: EspnStatRow, gamesPlayed: number): number | null => {
  const average = numberAt(row.averageStats, MINUTES)
  if (average !== null) return average
  const total = numberAt(row.stats, MINUTES)
  if (total === null || !(gamesPlayed > 0)) return null
  return total / gamesPlayed
}

const rateNumber = (
  row: EspnStatRow,
  key: string,
  gamesPlayed: number,
  counting: boolean,
): number | null => {
  const average = numberAt(row.averageStats, key)
  if (average !== null) return average
  if (!counting) return null
  const total = numberAt(row.stats, key)
  if (total === null || !(gamesPlayed > 0)) return null
  return total / gamesPlayed
}

const ratesFromRow = (
  row: EspnStatRow,
  gamesPlayed: number,
): Record<CategoryId, number> | null => {
  const counting: Record<Exclude<CategoryId, "FG_PCT" | "FT_PCT">, string> = {
    PTS: "0",
    BLK: "1",
    STL: "2",
    AST: "3",
    REB: "6",
    TO: "11",
    TPM: "17",
  }
  const rates = {} as Record<CategoryId, number>
  for (const categoryId of ALL_CATEGORY_IDS) {
    if (categoryId === "FG_PCT" || categoryId === "FT_PCT") continue
    const value = rateNumber(row, counting[categoryId], gamesPlayed, true)
    if (value === null) return null
    rates[categoryId] = value
  }

  const fgm = rateNumber(row, "13", gamesPlayed, true)
  const fga = rateNumber(row, "14", gamesPlayed, true)
  const ftm = rateNumber(row, "15", gamesPlayed, true)
  const fta = rateNumber(row, "16", gamesPlayed, true)
  const fg =
    rateNumber(row, "19", gamesPlayed, false) ??
    (fgm !== null && fga !== null && fga > 0 ? fgm / fga : null)
  const ft =
    rateNumber(row, "20", gamesPlayed, false) ??
    (ftm !== null && fta !== null && fta > 0 ? ftm / fta : null)
  if (fg === null || ft === null) return null
  rates.FG_PCT = fg
  rates.FT_PCT = ft
  return rates
}

const lineFromRow = (row: EspnStatRow | undefined): RateLine | null => {
  if (!row) return null
  const gamesPlayed = numberAt(row.stats, GAMES)
  if (gamesPlayed === null || !(gamesPlayed > 0)) return null
  return {
    gamesPlayed,
    minutesPerGame: minutesPerGame(row, gamesPlayed),
    rates: ratesFromRow(row, gamesPlayed),
  }
}

export const readBreakoutStatLines = (
  rows: readonly EspnStatRow[] | undefined,
  seasonId: number,
): BreakoutStatLines => {
  const list = rows ?? []
  const season = lineFromRow(findRow(list, seasonId, 0, 0))
  return {
    seasonGames: season?.gamesPlayed ?? null,
    season,
    last7: lineFromRow(findRow(list, seasonId, 0, 1)),
    projection: lineFromRow(findRow(list, seasonId, 1, 0)),
  }
}
