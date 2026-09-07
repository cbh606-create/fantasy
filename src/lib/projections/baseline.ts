import type { CategoryId } from "@/lib/domain/categories"
import { rateFromBox } from "@/lib/projections/rates"
import type { PlayerProjection, SeasonBox, ShootingVolume } from "@/lib/projections/types"

const perGame = (total: number, gp: number) => (gp > 0 ? total / gp : 0)

export const catsFromBox = (box: SeasonBox): Record<CategoryId, number> => ({
  FG_PCT: box.fga > 0 ? box.fgm / box.fga : 0,
  FT_PCT: box.fta > 0 ? box.ftm / box.fta : 0,
  TPM: perGame(box.tpm, box.gp),
  REB: perGame(box.reb, box.gp),
  AST: perGame(box.ast, box.gp),
  STL: perGame(box.stl, box.gp),
  BLK: perGame(box.blk, box.gp),
  TO: perGame(box.tov, box.gp),
  PTS: perGame(box.pts, box.gp)
})

const shootingFromBox = (box: SeasonBox): ShootingVolume => ({
  FGM: perGame(box.fgm, box.gp),
  FGA: perGame(box.fga, box.gp),
  FTM: perGame(box.ftm, box.gp),
  FTA: perGame(box.fta, box.gp)
})

export const lastYearBaseline = (boxes: SeasonBox[], targetSeason: number): PlayerProjection[] =>
  boxes.map((box) => ({
    playerId: box.playerId,
    name: box.name,
    season: targetSeason,
    teamId: box.teamId,
    positions: box.positions,
    mpg: box.mpg,
    gp: box.gp,
    usg: box.usg,
    rates: rateFromBox(box),
    projections: catsFromBox(box),
    shooting: shootingFromBox(box),
    source: "model",
    agingApplied: false
  }))
