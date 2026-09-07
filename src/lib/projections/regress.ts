import { primaryBucket } from "@/lib/projections/position"
import { rateFromBox, emptyRates } from "@/lib/projections/rates"
import type { PositionBucket, Rates, SeasonBox } from "@/lib/projections/types"

export const REGRESSION_K = {
  shooting: 50,
  creation: 40,
  athleticism: 80,
  size: 40,
  usg: 40
} as const

const blend = (observed: number, mean: number, gp: number, k: number) => {
  const w = gp / (gp + k)
  return w * observed + (1 - w) * mean
}

export const regressRates = (observed: Rates, mean: Rates, gp: number): Rates => ({
  pts: blend(observed.pts, mean.pts, gp, REGRESSION_K.creation),
  reb: blend(observed.reb, mean.reb, gp, REGRESSION_K.size),
  ast: blend(observed.ast, mean.ast, gp, REGRESSION_K.creation),
  stl: blend(observed.stl, mean.stl, gp, REGRESSION_K.athleticism),
  blk: blend(observed.blk, mean.blk, gp, REGRESSION_K.athleticism),
  tov: blend(observed.tov, mean.tov, gp, REGRESSION_K.creation),
  tpm: blend(observed.tpm, mean.tpm, gp, REGRESSION_K.creation),
  shooting: {
    FGM: blend(observed.shooting.FGM, mean.shooting.FGM, gp, REGRESSION_K.shooting),
    FGA: blend(observed.shooting.FGA, mean.shooting.FGA, gp, REGRESSION_K.shooting),
    FTM: blend(observed.shooting.FTM, mean.shooting.FTM, gp, REGRESSION_K.shooting),
    FTA: blend(observed.shooting.FTA, mean.shooting.FTA, gp, REGRESSION_K.shooting)
  }
})

export const regressUsg = (observed: number, mean: number, gp: number) =>
  blend(observed, mean, gp, REGRESSION_K.usg)

export type PositionMean = {
  rates: Rates
  usg: number
  gp: number
  n: number
}

const MEAN_GP_MIN = 20

export const positionMeans = (
  boxes: SeasonBox[]
): Record<PositionBucket, PositionMean> => {
  const acc: Record<PositionBucket, { rates: Rates; usg: number; gp: number; n: number }> = {
    G: { rates: emptyRates(), usg: 0, gp: 0, n: 0 },
    wing: { rates: emptyRates(), usg: 0, gp: 0, n: 0 },
    big: { rates: emptyRates(), usg: 0, gp: 0, n: 0 }
  }

  for (const box of boxes) {
    if (box.gp < MEAN_GP_MIN) continue
    const b = primaryBucket(box.positions)
    const r = rateFromBox(box)
    const slot = acc[b]
    slot.n += 1
    slot.usg += box.usg
    slot.gp += box.gp
    slot.rates.pts += r.pts
    slot.rates.reb += r.reb
    slot.rates.ast += r.ast
    slot.rates.stl += r.stl
    slot.rates.blk += r.blk
    slot.rates.tov += r.tov
    slot.rates.tpm += r.tpm
    slot.rates.shooting.FGM += r.shooting.FGM
    slot.rates.shooting.FGA += r.shooting.FGA
    slot.rates.shooting.FTM += r.shooting.FTM
    slot.rates.shooting.FTA += r.shooting.FTA
  }

  const out = {} as Record<PositionBucket, PositionMean>
  for (const key of ["G", "wing", "big"] as PositionBucket[]) {
    const slot = acc[key]
    const n = Math.max(slot.n, 1)
    out[key] = {
      n: slot.n,
      usg: slot.usg / n,
      gp: slot.gp / n,
      rates: {
        pts: slot.rates.pts / n,
        reb: slot.rates.reb / n,
        ast: slot.rates.ast / n,
        stl: slot.rates.stl / n,
        blk: slot.rates.blk / n,
        tov: slot.rates.tov / n,
        tpm: slot.rates.tpm / n,
        shooting: {
          FGM: slot.rates.shooting.FGM / n,
          FGA: slot.rates.shooting.FGA / n,
          FTM: slot.rates.shooting.FTM / n,
          FTA: slot.rates.shooting.FTA / n
        }
      }
    }
  }
  return out
}
