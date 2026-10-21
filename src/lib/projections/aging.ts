import type { PositionBucket, Rates } from "@/lib/projections/types"

export const AGING_ENABLED = false

export const applyAging = (
  rates: Rates,
  _age: number,
  _bucket: PositionBucket
): Rates => rates
