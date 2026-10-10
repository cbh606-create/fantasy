import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

export const MIN_PAIR_GAMES = 20
export const MIN_PAIR_ROWS = 40
export const PAIR_PENALTY_SCALE = 0.15

const COUNTING_IDS: CategoryId[] = ["TPM", "REB", "AST", "STL", "BLK", "TO", "PTS"]

export type StatPairShooting = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type StatPairObservation = {
  gamesPlayed: number
  projections: Record<CategoryId, number>
  shooting?: StatPairShooting
}

export type StatPairRow = {
  categoryA: CategoryId
  categoryB: CategoryId
  r: number
  penalty: number
  n: number
  measured: boolean
}

type LastSeasonLine = {
  projectedGames?: number
  projections: Record<CategoryId, number>
  shooting?: StatPairShooting
}

type CurrentSeasonLine = {
  seasonRates?: {
    gamesPlayed: number
    projections: Record<CategoryId, number>
    shooting: StatPairShooting
  }
}

export const pairPenalty = (r: number, measured = true): number => {
  if (!measured || r >= 0) return 0
  return -r * PAIR_PENALTY_SCALE
}

export const perGameObservation = (
  gamesPlayed: number,
  totals: Record<CategoryId, number>,
  shooting?: StatPairShooting,
): StatPairObservation => {
  const projections = { ...totals }
  for (const categoryId of COUNTING_IDS) {
    projections[categoryId] = totals[categoryId] / gamesPlayed
  }
  return {
    gamesPlayed,
    projections,
    shooting: shooting
      ? {
          FGM: shooting.FGM / gamesPlayed,
          FGA: shooting.FGA / gamesPlayed,
          FTM: shooting.FTM / gamesPlayed,
          FTA: shooting.FTA / gamesPlayed,
        }
      : undefined,
  }
}

export const observationFromPerGame = (
  seasonRates: NonNullable<CurrentSeasonLine["seasonRates"]>,
): StatPairObservation => ({
  gamesPlayed: seasonRates.gamesPlayed,
  projections: seasonRates.projections,
  shooting: seasonRates.shooting,
})

export const observationsForStatPairs = ({
  lastSeason,
  currentSeason,
}: {
  lastSeason: LastSeasonLine[]
  currentSeason: CurrentSeasonLine[]
}): StatPairObservation[] => {
  const rows: StatPairObservation[] = []
  for (const player of lastSeason) {
    if (player.projectedGames == null || player.projectedGames < MIN_PAIR_GAMES) continue
    rows.push(perGameObservation(player.projectedGames, player.projections, player.shooting))
  }
  for (const player of currentSeason) {
    if (!player.seasonRates || player.seasonRates.gamesPlayed < MIN_PAIR_GAMES) continue
    rows.push(observationFromPerGame(player.seasonRates))
  }
  return rows
}

const fantasyGood = (
  observation: StatPairObservation,
  categoryId: CategoryId,
): number | null => {
  if (categoryId === "FG_PCT") {
    if (observation.shooting && observation.shooting.FGA <= 0) return null
    const value = observation.projections.FG_PCT
    return Number.isFinite(value) ? value : null
  }
  if (categoryId === "FT_PCT") {
    if (observation.shooting && observation.shooting.FTA <= 0) return null
    const value = observation.projections.FT_PCT
    return Number.isFinite(value) ? value : null
  }
  const value = observation.projections[categoryId]
  if (!Number.isFinite(value)) return null
  return categoryId === "TO" ? -value : value
}

const pearson = (valuesA: number[], valuesB: number[]): { r: number; measured: boolean } => {
  const n = valuesA.length
  if (n < MIN_PAIR_ROWS) return { r: 0, measured: false }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / n
  const meanA = mean(valuesA)
  const meanB = mean(valuesB)
  let covariance = 0
  let varianceA = 0
  let varianceB = 0
  for (let index = 0; index < n; index += 1) {
    const deltaA = valuesA[index] - meanA
    const deltaB = valuesB[index] - meanB
    covariance += deltaA * deltaB
    varianceA += deltaA * deltaA
    varianceB += deltaB * deltaB
  }
  if (varianceA === 0 || varianceB === 0) return { r: 0, measured: false }
  return { r: covariance / Math.sqrt(varianceA * varianceB), measured: true }
}

const pairKey = (row: Pick<StatPairRow, "categoryA" | "categoryB">) =>
  `${row.categoryA}|${row.categoryB}`

export const buildStatPairRows = (
  observations: StatPairObservation[],
): StatPairRow[] => {
  const qualified = observations.filter((observation) => observation.gamesPlayed >= MIN_PAIR_GAMES)
  if (qualified.length === 0) return []

  const rows: StatPairRow[] = []
  for (let left = 0; left < ALL_CATEGORY_IDS.length; left += 1) {
    for (let right = left + 1; right < ALL_CATEGORY_IDS.length; right += 1) {
      const categoryA = ALL_CATEGORY_IDS[left]
      const categoryB = ALL_CATEGORY_IDS[right]
      const valuesA: number[] = []
      const valuesB: number[] = []
      for (const observation of qualified) {
        const a = fantasyGood(observation, categoryA)
        const b = fantasyGood(observation, categoryB)
        if (a == null || b == null) continue
        valuesA.push(a)
        valuesB.push(b)
      }
      const result = pearson(valuesA, valuesB)
      rows.push({
        categoryA,
        categoryB,
        r: result.r,
        penalty: pairPenalty(result.r, result.measured),
        n: valuesA.length,
        measured: result.measured,
      })
    }
  }

  return rows.sort((a, b) => {
    if (a.measured !== b.measured) return a.measured ? -1 : 1
    if (a.measured && a.r !== b.r) return a.r - b.r
    return pairKey(a).localeCompare(pairKey(b))
  })
}
