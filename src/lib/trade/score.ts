import { BEST_PLAYER_GAP, FAIRNESS_BAND, OVERPAY_RATIO } from "./constants"
import type { TradePackage } from "./types"

const EPSILON = 1e-6

const totalValue = (playerIds: string[], values: Map<string, number>) =>
  playerIds.reduce((sum, playerId) => sum + (values.get(playerId) ?? 0), 0)

const peakValue = (playerIds: string[], values: Map<string, number>) =>
  playerIds.reduce(
    (peak, playerId) => Math.max(peak, values.get(playerId) ?? 0),
    Number.NEGATIVE_INFINITY,
  )

export const passesShapeRules = (
  tradePackage: TradePackage,
  values: Map<string, number>,
): { ok: boolean; overpayRatio?: number; bestPlayerGap?: number } => {
  const giveValue = totalValue(tradePackage.youPlayerIds, values)
  const getValue = totalValue(tradePackage.themPlayerIds, values)
  const bestPlayerGap = Math.abs(
    peakValue(tradePackage.youPlayerIds, values) - peakValue(tradePackage.themPlayerIds, values),
  )
  const bestOk = bestPlayerGap <= BEST_PLAYER_GAP
  const bestFields = bestOk ? {} : { bestPlayerGap }

  if (tradePackage.youPlayerIds.length === tradePackage.themPlayerIds.length) {
    const spread = Math.abs(giveValue - getValue)
      / Math.max(giveValue, getValue, EPSILON)

    return { ok: spread <= FAIRNESS_BAND && bestOk, ...bestFields }
  }

  const sendsMorePlayers =
    tradePackage.youPlayerIds.length > tradePackage.themPlayerIds.length
  const multiValue = sendsMorePlayers ? giveValue : getValue
  const singleValue = sendsMorePlayers ? getValue : giveValue
  const overpayRatio = multiValue / Math.max(singleValue, EPSILON)

  return {
    ok: singleValue > 0 && multiValue > 0 && overpayRatio >= OVERPAY_RATIO && bestOk,
    overpayRatio,
    ...bestFields,
  }
}

/** Relative spread between the two sides of an equal-size package. */
export const evenValueGap = (
  tradePackage: TradePackage,
  values: Map<string, number>,
): number => {
  const giveValue = totalValue(tradePackage.youPlayerIds, values)
  const getValue = totalValue(tradePackage.themPlayerIds, values)

  return Math.abs(giveValue - getValue)
    / Math.max(giveValue, getValue, EPSILON)
}

export const RESIDUAL_SCORE_OFFSET = 1_000_000

export const offerSortScore = (youSum: number, themSum: number) => {
  if (youSum > 0 && themSum > 0) {
    return (2 * youSum * themSum) / (youSum + themSum)
  }

  return youSum + themSum - RESIDUAL_SCORE_OFFSET
}
