import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/categories"
import { catsFromBox, uniqueBoxesByPlayer } from "@/lib/projections/baseline"
import type { PlayerProjection, SeasonBox } from "@/lib/projections/types"

export type MaeKey = "MPG" | "USG" | CategoryId

export type BacktestReport = {
  eligibleIds: string[]
  mae: Record<MaeKey, { model: number; baseline: number }>
  spearman: { model: number; baseline: number }
  beatsMae: boolean
  beatsSpearman: boolean
}

const mean = (values: number[]): number => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const populationStdev = (values: number[], avg: number): number => {
  if (values.length === 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export const categoryZ = (
  projections: Record<CategoryId, number>,
  pool: Record<CategoryId, number>[]
): Record<CategoryId, number> => {
  const out = {} as Record<CategoryId, number>
  for (const id of ALL_CATEGORY_IDS) {
    const values = pool.map((row) => row[id])
    const avg = mean(values)
    const stdev = populationStdev(values, avg)
    if (stdev === 0) {
      out[id] = 0
      continue
    }
    out[id] = id === "TO" ? (avg - projections[id]) / stdev : (projections[id] - avg) / stdev
  }
  return out
}

export const meanAbsoluteError = (pred: number, actual: number): number => Math.abs(pred - actual)

const toRanks = (values: number[]): number[] => {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i + 1
    while (j < indexed.length && indexed[j].value === indexed[i].value) j++
    const avgRank = (i + 1 + j) / 2
    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = avgRank
    }
    i = j
  }
  return ranks
}

const pearson = (xs: number[], ys: number[]): number => {
  const n = xs.length
  if (n === 0 || ys.length !== n) return 0
  const mx = mean(xs)
  const my = mean(ys)
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  const sx = Math.sqrt(vx)
  const sy = Math.sqrt(vy)
  if (sx === 0 || sy === 0) return 0
  return cov / (sx * sy)
}

export const spearman = (ranksA: number[], ranksB: number[]): number => {
  const ra = toRanks(ranksA)
  const rb = toRanks(ranksB)
  if (ra.length === 0) return 0
  return pearson(ra, rb)
}

const firstById = <T extends { playerId: string; teamId?: string }>(rows: T[]): Map<string, T> => {
  const map = new Map<string, T>()
  for (const row of rows) {
    const existing = map.get(row.playerId)
    if (!existing || row.teamId === "TOT") map.set(row.playerId, row)
  }
  return map
}

const zSum = (projections: Record<CategoryId, number>, pool: Record<CategoryId, number>[]): number => {
  const z = categoryZ(projections, pool)
  return ALL_CATEGORY_IDS.reduce((sum, id) => sum + z[id], 0)
}

const valueOf = (row: PlayerProjection, key: MaeKey): number => {
  if (key === "MPG") return row.mpg
  if (key === "USG") return row.usg
  return row.projections[key]
}

const actualValue = (box: SeasonBox, key: MaeKey): number => {
  if (key === "MPG") return box.mpg
  if (key === "USG") return box.usg
  return catsFromBox(box)[key]
}

export const backtest = (args: {
  predicted: PlayerProjection[]
  baseline: PlayerProjection[]
  actuals: SeasonBox[]
}): BacktestReport => {
  const predictedById = firstById(args.predicted)
  const baselineById = firstById(args.baseline)
  const eligible = uniqueBoxesByPlayer(args.actuals).filter(
    (box) => box.gp >= 20 && predictedById.has(box.playerId) && baselineById.has(box.playerId)
  )
  const eligibleIds = eligible.map((box) => box.playerId)
  const maeKeys: MaeKey[] = ["MPG", "USG", ...ALL_CATEGORY_IDS]
  const mae = {} as BacktestReport["mae"]

  for (const key of maeKeys) {
    mae[key] = {
      model: mean(
        eligible.map((box) =>
          meanAbsoluteError(valueOf(predictedById.get(box.playerId)!, key), actualValue(box, key))
        )
      ),
      baseline: mean(
        eligible.map((box) =>
          meanAbsoluteError(valueOf(baselineById.get(box.playerId)!, key), actualValue(box, key))
        )
      )
    }
  }

  const catWins = ALL_CATEGORY_IDS.filter((id) => mae[id].model < mae[id].baseline).length
  const beatsMae = mae.MPG.model < mae.MPG.baseline && mae.USG.model < mae.USG.baseline && catWins >= 6

  const predCats = eligible.map((box) => predictedById.get(box.playerId)!.projections)
  const baseCats = eligible.map((box) => baselineById.get(box.playerId)!.projections)
  const actualCats = eligible.map((box) => catsFromBox(box))
  const spearmanScores = {
    model: spearman(
      predCats.map((row) => zSum(row, predCats)),
      actualCats.map((row) => zSum(row, actualCats))
    ),
    baseline: spearman(
      baseCats.map((row) => zSum(row, baseCats)),
      actualCats.map((row) => zSum(row, actualCats))
    )
  }

  return {
    eligibleIds,
    mae,
    spearman: spearmanScores,
    beatsMae,
    beatsSpearman: spearmanScores.model >= spearmanScores.baseline
  }
}
