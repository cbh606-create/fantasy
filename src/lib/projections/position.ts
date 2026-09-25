import type { NbaPosition, PositionBucket } from "@/lib/projections/types"

export const positionBucket = (pos: NbaPosition): PositionBucket => {
  if (pos === "PG" || pos === "SG") return "G"
  if (pos === "SF") return "wing"
  return "big"
}

export const primaryBucket = (positions: NbaPosition[]): PositionBucket => {
  if (positions.length === 0) return "wing"
  return positionBucket(positions[0])
}
