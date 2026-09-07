import { primaryBucket } from "@/lib/projections/position"
import type { NbaPosition, PositionBucket, RosterSnapshot } from "@/lib/projections/types"

export type UsageInput = {
  playerId: string
  positions: NbaPosition[]
  mpg: number
  priorUsg: number
  priorMpg?: number
}

const TARGET_USG = 100
const TEAM_MINUTES = 240
const ON_COURT = 5
const MAX_USG = 35
const MIN_USG = 8
const MAX_LOOPS = 8

const sumMap = (values: Map<string, number>) => {
  let total = 0
  for (const value of values.values()) total += value
  return total
}

export const weightedUsage = (
  usg: Map<string, number>,
  mpg: Map<string, number>
): number => {
  let acc = 0
  for (const [id, value] of usg) acc += value * (mpg.get(id) ?? 0)
  return (ON_COURT * acc) / TEAM_MINUTES
}

const vacantClaims = (inputs: UsageInput[], roster: RosterSnapshot) => {
  const bucketCount = new Map<PositionBucket, number>()
  for (const input of inputs) {
    const bucket = primaryBucket(input.positions)
    bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1)
  }

  const departedByBucket = new Map<PositionBucket, number>()
  for (const departed of roster.departed) {
    const bucket = primaryBucket(departed.positions)
    departedByBucket.set(bucket, (departedByBucket.get(bucket) ?? 0) + departed.lastUsg)
  }

  let emptyBucketLeftover = 0
  for (const [bucket, departedUsg] of departedByBucket) {
    if ((bucketCount.get(bucket) ?? 0) === 0) emptyBucketLeftover += departedUsg
  }

  const priorSum = inputs.reduce((total, input) => total + input.priorUsg, 0)
  const claims = new Map<string, number>()
  for (const input of inputs) {
    const bucket = primaryBucket(input.positions)
    const sameBucketCount = bucketCount.get(bucket) ?? 0
    const bucketShare =
      sameBucketCount > 0 ? (departedByBucket.get(bucket) ?? 0) / sameBucketCount : 0
    const leftoverShare =
      priorSum > 0 ? (emptyBucketLeftover * input.priorUsg) / priorSum : 0
    const departedSameBucketUsg = bucketShare + leftoverShare
    claims.set(input.playerId, input.priorUsg * 0.5 + departedSameBucketUsg * 0.5)
  }
  return claims
}

const receivedVacancyMinutes = (mpg: number, priorMpg?: number) =>
  mpg > (priorMpg ?? mpg)

const usageFloor = (priorUsg: number, mpg: number, priorMpg?: number) => {
  if (priorUsg < MIN_USG && !receivedVacancyMinutes(mpg, priorMpg)) return priorUsg
  return MIN_USG
}

const capUsg = (
  usg: Map<string, number>,
  prior: Map<string, number>,
  mpg: Map<string, number>,
  priorMpg: Map<string, number | undefined>
) => {
  for (const [id, value] of usg) {
    const floor = usageFloor(prior.get(id) ?? value, mpg.get(id) ?? 0, priorMpg.get(id))
    usg.set(id, Math.min(MAX_USG, Math.max(floor, value)))
  }
}

const addByWeights = (
  usg: Map<string, number>,
  weights: Map<string, number>,
  extra: number
) => {
  const eligible = new Map<string, number>()
  for (const [id, current] of usg) {
    if (current >= MAX_USG) continue
    eligible.set(id, weights.get(id) ?? 0)
  }
  const weightSum = sumMap(eligible)
  if (weightSum <= 0) return
  for (const [id, weight] of eligible) {
    usg.set(id, (usg.get(id) ?? 0) + (extra * weight) / weightSum)
  }
}

const scaleAll = (usg: Map<string, number>, factor: number) => {
  for (const [id, value] of usg) usg.set(id, value * factor)
}

const isHighCapped = (value: number) => value >= MAX_USG - 1e-12

const isLowCapped = (value: number, floor: number) => value <= floor + 1e-12

const scaleUncapped = (
  usg: Map<string, number>,
  mpg: Map<string, number>,
  prior: Map<string, number>,
  priorMpg: Map<string, number | undefined>,
  scaleUp: boolean
) => {
  const targetMass = (TARGET_USG * TEAM_MINUTES) / ON_COURT
  let cappedMass = 0
  let freeMass = 0
  const freeIds: string[] = []
  for (const [id, value] of usg) {
    const minutes = mpg.get(id) ?? 0
    const floor = usageFloor(prior.get(id) ?? value, minutes, priorMpg.get(id))
    const locked = scaleUp ? isHighCapped(value) : isLowCapped(value, floor)
    if (locked) cappedMass += value * minutes
    else {
      freeMass += value * minutes
      freeIds.push(id)
    }
  }
  if (freeMass <= 0) return
  const factor = (targetMass - cappedMass) / freeMass
  if (factor <= 0) return
  for (const id of freeIds) usg.set(id, (usg.get(id) ?? 0) * factor)
}

export const allocateUsage = (
  inputs: UsageInput[],
  roster: RosterSnapshot
): Map<string, number> => {
  const usg = new Map<string, number>()
  const mpg = new Map<string, number>()
  const prior = new Map<string, number>()
  const priorMpg = new Map<string, number | undefined>()
  for (const input of inputs) {
    usg.set(input.playerId, input.priorUsg)
    mpg.set(input.playerId, input.mpg)
    prior.set(input.playerId, input.priorUsg)
    priorMpg.set(input.playerId, input.priorMpg)
  }

  const claims = vacantClaims(inputs, roster)
  capUsg(usg, prior, mpg, priorMpg)

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const weighted = weightedUsage(usg, mpg)
    if (Math.abs(weighted - TARGET_USG) <= 1e-9) break
    if (weighted < TARGET_USG) addByWeights(usg, claims, TARGET_USG - weighted)
    else scaleAll(usg, TARGET_USG / weighted)
    capUsg(usg, prior, mpg, priorMpg)
  }

  const afterLoops = weightedUsage(usg, mpg)
  if (Math.abs(afterLoops - TARGET_USG) > 1e-9) {
    if (afterLoops > 0) scaleAll(usg, TARGET_USG / afterLoops)
    capUsg(usg, prior, mpg, priorMpg)
    const blocked = weightedUsage(usg, mpg)
    if (Math.abs(blocked - TARGET_USG) > 1e-9) {
      scaleUncapped(usg, mpg, prior, priorMpg, blocked < TARGET_USG)
      capUsg(usg, prior, mpg, priorMpg)
    }
  }

  return usg
}
