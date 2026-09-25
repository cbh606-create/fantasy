import type { CategoryId } from "@/lib/domain/categories"
import type { Rates, ShootingVolume } from "@/lib/projections/types"

export type ComposeInput = {
  rates: Rates
  mpg: number
  allocatedUsg: number
  baselineUsg: number
  pace: number
  positionMeanFg: number
  positionMeanFt: number
}

export type ComposeOutput = {
  projections: Record<CategoryId, number>
  shooting: ShootingVolume
}

export const compose = (args: ComposeInput): ComposeOutput => {
  const { rates, mpg, allocatedUsg, baselineUsg, pace, positionMeanFg, positionMeanFt } = args
  const minuteScale = mpg / 36
  const usageScale = allocatedUsg / Math.max(baselineUsg, 8)
  const paceScale = pace / 100

  const reb = rates.reb * minuteScale * paceScale
  const stl = rates.stl * minuteScale * paceScale
  const blk = rates.blk * minuteScale * paceScale

  const pts = rates.pts * minuteScale * usageScale * paceScale
  const ast = rates.ast * minuteScale * usageScale * paceScale
  const to = rates.tov * minuteScale * usageScale * paceScale
  const tpm = rates.tpm * minuteScale * usageScale * paceScale

  const shooting: ShootingVolume = {
    FGM: rates.shooting.FGM * minuteScale * usageScale * paceScale,
    FGA: rates.shooting.FGA * minuteScale * usageScale * paceScale,
    FTM: rates.shooting.FTM * minuteScale * usageScale * paceScale,
    FTA: rates.shooting.FTA * minuteScale * usageScale * paceScale
  }

  const fgPct = shooting.FGA === 0 ? positionMeanFg : shooting.FGM / shooting.FGA
  const ftPct = shooting.FTA === 0 ? positionMeanFt : shooting.FTM / shooting.FTA

  return {
    projections: {
      FG_PCT: fgPct,
      FT_PCT: ftPct,
      TPM: tpm,
      REB: reb,
      AST: ast,
      STL: stl,
      BLK: blk,
      TO: to,
      PTS: pts
    },
    shooting
  }
}
