import { FAIRNESS_BAND, OVERPAY_RATIO } from "./constants"
import type { TradePackage } from "./types"

const EPSILON = 1e-6
const REPLACEMENT_VALUE = 1

/**
 * Raw player values are z-sums and can be negative, which makes value ratios
 * meaningless. Shifting the whole pool so the least valuable rostered player is
 * worth 1 keeps the ordering intact and lets fairness/overpay use ratios.
 */
export const replacementScaledValues = (
  values: Map<string, number>,
): Map<string, number> => {
  if (values.size === 0) {
    return new Map()
  }

  const shift = REPLACEMENT_VALUE - Math.min(...values.values())

  return new Map(
    [...values].map(([playerId, value]) => [playerId, value + shift]),
  )
}

const totalValue = (playerIds: string[], values: Map<string, number>) =>
  playerIds.reduce((sum, playerId) => sum + (values.get(playerId) ?? 0), 0)

export const passesShapeRules = (
  tradePackage: TradePackage,
  values: Map<string, number>,
): { ok: boolean; overpayRatio?: number } => {
  const giveValue = totalValue(tradePackage.youPlayerIds, values)
  const getValue = totalValue(tradePackage.themPlayerIds, values)

  if (tradePackage.youPlayerIds.length === tradePackage.themPlayerIds.length) {
    const spread = Math.abs(giveValue - getValue)
      / Math.max(giveValue, getValue, EPSILON)

    return { ok: spread <= FAIRNESS_BAND }
  }

  const sendsMorePlayers =
    tradePackage.youPlayerIds.length > tradePackage.themPlayerIds.length
  const multiValue = sendsMorePlayers ? giveValue : getValue
  const singleValue = sendsMorePlayers ? getValue : giveValue
  const overpayRatio = multiValue / Math.max(singleValue, EPSILON)

  return { ok: overpayRatio >= OVERPAY_RATIO, overpayRatio }
}

export const mutualScore = (
  youDeltaNeeds: number,
  themDeltaNeeds: number,
): number => {
  if (youDeltaNeeds <= 0 || themDeltaNeeds <= 0) {
    return 0
  }

  return (2 * youDeltaNeeds * themDeltaNeeds)
    / (youDeltaNeeds + themDeltaNeeds)
}
