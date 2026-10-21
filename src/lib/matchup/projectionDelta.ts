import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import {
  emptyCategoryTotals,
  type CategoryTotals,
  type DayShootingTotals,
} from "@/lib/matchup/morningCheck"
import { categoryStatLead } from "@/lib/season/formatCategoryStat"

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

export type ProjectionActualPart = {
  projection: CategoryTotals
  projectionShooting?: DayShootingTotals | null
  actual: CategoryTotals | null
  actualShooting?: DayShootingTotals | null
  playedIds?: string[]
}

const shootingHasBox = (
  shooting: DayShootingTotals | null | undefined,
): boolean =>
  Boolean(
    shooting &&
      (shooting.FGM > 0 ||
        shooting.FGA > 0 ||
        shooting.FTM > 0 ||
        shooting.FTA > 0),
  )

const hasBoxActual = (part: ProjectionActualPart): boolean => {
  const actual = part.actual
  if (!actual) return false
  if ((part.playedIds?.length ?? 0) > 0) return true
  if (shootingHasBox(part.actualShooting)) return true
  return COUNTING_CATEGORIES.some((categoryId) => actual[categoryId] > 0)
}

const rate = (makes: number, attempts: number): number =>
  attempts > 0 ? makes / attempts : 0

/**
 * Actual minus projection for days that have a box.
 * Counting stats sum. FG%/FT% use summed makes/attempts, not summed percentages.
 */
export const actualMinusProjection = (
  parts: ProjectionActualPart[],
): CategoryTotals | null => {
  const present = parts.filter(hasBoxActual)
  if (present.length === 0) return null

  const delta = emptyCategoryTotals()
  for (const part of present) {
    const actual = part.actual
    if (!actual) continue
    for (const categoryId of COUNTING_CATEGORIES) {
      delta[categoryId] += actual[categoryId] - part.projection[categoryId]
    }
  }

  const canVolume = present.every(
    (part) => part.actualShooting && part.projectionShooting,
  )
  if (canVolume) {
    let actualFgm = 0
    let actualFga = 0
    let actualFtm = 0
    let actualFta = 0
    let projectedFgm = 0
    let projectedFga = 0
    let projectedFtm = 0
    let projectedFta = 0
    for (const part of present) {
      const actualShooting = part.actualShooting
      const projectionShooting = part.projectionShooting
      if (!actualShooting || !projectionShooting) continue
      actualFgm += actualShooting.FGM
      actualFga += actualShooting.FGA
      actualFtm += actualShooting.FTM
      actualFta += actualShooting.FTA
      projectedFgm += projectionShooting.FGM
      projectedFga += projectionShooting.FGA
      projectedFtm += projectionShooting.FTM
      projectedFta += projectionShooting.FTA
    }
    delta.FG_PCT = rate(actualFgm, actualFga) - rate(projectedFgm, projectedFga)
    delta.FT_PCT = rate(actualFtm, actualFta) - rate(projectedFtm, projectedFta)
    return delta
  }

  const only = present.length === 1 ? present[0] : null
  if (only?.actual) {
    delta.FG_PCT = only.actual.FG_PCT - only.projection.FG_PCT
    delta.FT_PCT = only.actual.FT_PCT - only.projection.FT_PCT
    return delta
  }

  delta.FG_PCT = Number.NaN
  delta.FT_PCT = Number.NaN
  return delta
}

export const weekAdvantage = (
  youDelta: CategoryTotals | null | undefined,
  oppDelta: CategoryTotals | null | undefined,
): CategoryTotals | null => {
  if (!youDelta || !oppDelta) return null
  const advantage = emptyCategoryTotals()
  for (const categoryId of ALL_CATEGORY_IDS) {
    const you = youDelta[categoryId]
    const opp = oppDelta[categoryId]
    if (!Number.isFinite(you) || !Number.isFinite(opp)) {
      advantage[categoryId] = Number.NaN
      continue
    }
    advantage[categoryId] = categoryStatLead(categoryId, you, opp)
  }
  return advantage
}
