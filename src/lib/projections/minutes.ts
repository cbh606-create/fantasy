import { primaryBucket } from "@/lib/projections/position"
import type { NbaPosition, PositionBucket, RosterSnapshot } from "@/lib/projections/types"

export type MinutesInput = {
  playerId: string
  positions: NbaPosition[]
  priorMpg: number
}

const TARGET_MINUTES = 240
const MAX_MPG = 38
const MIN_MPG = 0
const SURPLUS_CUT_LINE = 20
const MAX_LOOPS = 8
const CLOSE_ENOUGH = 0.5

const sumMap = (values: Map<string, number>) => {
  let total = 0
  for (const value of values.values()) total += value
  return total
}

const capMpg = (mpg: number) => Math.min(MAX_MPG, Math.max(MIN_MPG, mpg))

const vacantClaims = (inputs: MinutesInput[], roster: RosterSnapshot) => {
  const bucketCount = new Map<PositionBucket, number>()
  for (const input of inputs) {
    const bucket = primaryBucket(input.positions)
    bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1)
  }

  const departedByBucket = new Map<PositionBucket, number>()
  for (const departed of roster.departed) {
    const bucket = primaryBucket(departed.positions)
    departedByBucket.set(bucket, (departedByBucket.get(bucket) ?? 0) + departed.lastMpg)
  }

  let emptyBucketLeftover = 0
  for (const [bucket, departedMpg] of departedByBucket) {
    if ((bucketCount.get(bucket) ?? 0) === 0) emptyBucketLeftover += departedMpg
  }

  const priorSum = inputs.reduce((total, input) => total + input.priorMpg, 0)
  const claims = new Map<string, number>()
  for (const input of inputs) {
    const bucket = primaryBucket(input.positions)
    const sameBucketCount = bucketCount.get(bucket) ?? 0
    const bucketShare =
      sameBucketCount > 0 ? (departedByBucket.get(bucket) ?? 0) / sameBucketCount : 0
    const leftoverShare =
      priorSum > 0 ? (emptyBucketLeftover * input.priorMpg) / priorSum : 0
    const departedSameBucketMpg = bucketShare + leftoverShare
    claims.set(input.playerId, input.priorMpg * 0.5 + departedSameBucketMpg * 0.5)
  }
  return claims
}

const addByWeights = (
  mpg: Map<string, number>,
  weights: Map<string, number>,
  extra: number
) => {
  const eligible = new Map<string, number>()
  for (const [id, current] of mpg) {
    if (current >= MAX_MPG) continue
    eligible.set(id, weights.get(id) ?? 0)
  }
  const weightSum = sumMap(eligible)
  if (weightSum <= 0) {
    const roomIds = [...mpg.keys()].filter((id) => (mpg.get(id) ?? 0) < MAX_MPG)
    if (roomIds.length === 0) return
    const share = extra / roomIds.length
    for (const id of roomIds) mpg.set(id, capMpg((mpg.get(id) ?? 0) + share))
    return
  }
  for (const [id, weight] of eligible) {
    mpg.set(id, capMpg((mpg.get(id) ?? 0) + (extra * weight) / weightSum))
  }
}

const cutSurplus = (
  mpg: Map<string, number>,
  prior: Map<string, number>,
  surplus: number
) => {
  const aboveLine = new Map<string, number>()
  for (const [id, current] of mpg) {
    aboveLine.set(id, Math.max(0, current - SURPLUS_CUT_LINE))
  }
  const aboveSum = sumMap(aboveLine)
  if (aboveSum > 0) {
    for (const [id, current] of mpg) {
      mpg.set(id, capMpg(current - (surplus * (aboveLine.get(id) ?? 0)) / aboveSum))
    }
    return
  }
  const priorSum = sumMap(prior)
  if (priorSum <= 0) return
  for (const [id, current] of mpg) {
    mpg.set(id, capMpg(current - (surplus * (prior.get(id) ?? 0)) / priorSum))
  }
}

const snapScale = (mpg: Map<string, number>) => {
  const total = sumMap(mpg)
  if (total === 0) return
  const scale = TARGET_MINUTES / total
  for (const [id, current] of mpg) mpg.set(id, current * scale)
}

export const allocateMinutes = (
  inputs: MinutesInput[],
  roster: RosterSnapshot
): Map<string, number> => {
  const mpg = new Map<string, number>()
  const prior = new Map<string, number>()
  for (const input of inputs) {
    prior.set(input.playerId, input.priorMpg)
    mpg.set(input.playerId, capMpg(input.priorMpg))
  }

  const claims = vacantClaims(inputs, roster)

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const total = sumMap(mpg)
    if (Math.abs(total - TARGET_MINUTES) <= CLOSE_ENOUGH) break
    if (total < TARGET_MINUTES) addByWeights(mpg, claims, TARGET_MINUTES - total)
    else cutSurplus(mpg, prior, total - TARGET_MINUTES)
  }

  snapScale(mpg)
  return mpg
}
