import type { Rates, SeasonBox, ShootingVolume } from "@/lib/projections/types"

export const emptyShooting = (): ShootingVolume => ({
  FGM: 0,
  FGA: 0,
  FTM: 0,
  FTA: 0
})

export const emptyRates = (): Rates => ({
  pts: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  tpm: 0,
  shooting: emptyShooting()
})

const per36 = (total: number, mp: number) => (total * 36) / Math.max(mp, 1)

export const rateFromBox = (box: SeasonBox): Rates => ({
  pts: per36(box.pts, box.mp),
  reb: per36(box.reb, box.mp),
  ast: per36(box.ast, box.mp),
  stl: per36(box.stl, box.mp),
  blk: per36(box.blk, box.mp),
  tov: per36(box.tov, box.mp),
  tpm: per36(box.tpm, box.mp),
  shooting: {
    FGM: per36(box.fgm, box.mp),
    FGA: per36(box.fga, box.mp),
    FTM: per36(box.ftm, box.mp),
    FTA: per36(box.fta, box.mp)
  }
})
