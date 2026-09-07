import { primaryBucket } from "@/lib/projections/position"
import type { NbaPosition, PositionBucket, RosterSnapshot, SeasonBox } from "@/lib/projections/types"

export const MIN_ROTATION = 8
export const ROTATION_FLOOR_MPG = 10
export const DEFAULT_ROTATION = 10

export const rotationWidth = (
  boxes: SeasonBox[],
  teamId: string,
  rosterSize: number
): number => {
  if (rosterSize < MIN_ROTATION) return rosterSize
  let qualified = 0
  for (const row of boxes) {
    if (row.teamId === "TOT") continue
    if (row.teamId !== teamId) continue
    if (row.mpg >= ROTATION_FLOOR_MPG) qualified += 1
  }
  const qualifiedCount = qualified === 0 ? DEFAULT_ROTATION : qualified
  return Math.min(rosterSize, Math.max(MIN_ROTATION, qualifiedCount))
}

export type MinutesInput = {
  playerId: string
  positions: NbaPosition[]
  priorMpg: number
}

export const TARGET_MINUTES = 240
export const MAX_MPG = 38
export const PROTECTED_STARTERS = 5

const capMpg = (mpg: number) => Math.min(MAX_MPG, Math.max(0, mpg))

const sumMap = (values: Map<string, number>) => {
  let total = 0
  for (const value of values.values()) total += value
  return total
}

const benchClaims = (receivers: MinutesInput[], roster: RosterSnapshot) => {
  const bucketCount = new Map<PositionBucket, number>()
  for (const input of receivers) {
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

  const priorSum = receivers.reduce((total, input) => total + input.priorMpg, 0)
  const claims = new Map<string, number>()
  for (const input of receivers) {
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
  extra: number,
  ids: string[]
) => {
  let remaining = extra
  while (remaining > 1e-6) {
    const eligible = new Map<string, number>()
    for (const id of ids) {
      if ((mpg.get(id) ?? 0) >= MAX_MPG) continue
      eligible.set(id, weights.get(id) ?? 0)
    }
    if (eligible.size === 0) break

    const weightSum = sumMap(eligible)
    let distributed = 0

    if (weightSum <= 0) {
      const roomIds = [...eligible.keys()]
      const share = remaining / roomIds.length
      for (const id of roomIds) {
        const before = mpg.get(id) ?? 0
        const after = capMpg(before + share)
        distributed += after - before
        mpg.set(id, after)
      }
    } else {
      for (const [id, weight] of eligible) {
        const before = mpg.get(id) ?? 0
        const after = capMpg(before + (remaining * weight) / weightSum)
        distributed += after - before
        mpg.set(id, after)
      }
    }

    if (distributed <= 1e-6) break
    remaining -= distributed
  }
}

export const allocateMinutes = (
  inputs: MinutesInput[],
  roster: RosterSnapshot,
  rotationN: number
): Map<string, number> => {
  const rosterIds = new Set(roster.players.map((player) => player.playerId))
  const rosterInputs = inputs.filter((input) => rosterIds.has(input.playerId))
  const ranked = [...rosterInputs].sort((a, b) => {
    if (b.priorMpg !== a.priorMpg) return b.priorMpg - a.priorMpg
    return a.playerId.localeCompare(b.playerId)
  })
  const mpg = new Map<string, number>()
  const protectedIds = ranked.slice(0, PROTECTED_STARTERS).map((row) => row.playerId)
  const bench = ranked.slice(PROTECTED_STARTERS, rotationN)
  const benchIds = bench.map((row) => row.playerId)

  for (const row of ranked) mpg.set(row.playerId, 0)
  for (const row of ranked.slice(0, PROTECTED_STARTERS)) {
    mpg.set(row.playerId, capMpg(row.priorMpg))
  }

  const leftover = TARGET_MINUTES - sumMap(new Map(protectedIds.map((id) => [id, mpg.get(id) ?? 0])))

  if (leftover <= 0) {
    const protectedSum = [...protectedIds].reduce((total, id) => total + (mpg.get(id) ?? 0), 0)
    if (protectedSum > 0) {
      const scale = TARGET_MINUTES / protectedSum
      for (const id of protectedIds) mpg.set(id, capMpg((mpg.get(id) ?? 0) * scale))
    }
    return mpg
  }

  if (benchIds.length === 0) return mpg

  const claims = benchClaims(bench, roster)
  addByWeights(mpg, claims, leftover, benchIds)

  const protectedSum = protectedIds.reduce((total, id) => total + (mpg.get(id) ?? 0), 0)
  const benchSum = benchIds.reduce((total, id) => total + (mpg.get(id) ?? 0), 0)
  const benchTarget = TARGET_MINUTES - protectedSum
  if (benchSum > 0 && benchTarget > 0 && ranked.length >= MIN_ROTATION) {
    const scale = benchTarget / benchSum
    for (const id of benchIds) mpg.set(id, capMpg((mpg.get(id) ?? 0) * scale))
    const after = benchIds.reduce((total, id) => total + (mpg.get(id) ?? 0), 0)
    if (after + 0.01 < benchTarget) {
      addByWeights(mpg, claims, benchTarget - after, benchIds)
    }
  }

  return mpg
}
