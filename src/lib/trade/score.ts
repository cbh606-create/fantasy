import { FAIRNESS_BAND, OVERPAY_RATIO } from "./constants"
import type { TradePackage } from "./types"

const EPSILON = 1e-6

/**
 * Raw player values are z-sums and can be negative, which makes value ratios
 * meaningless. Softplus maps each z-sum to a positive number using only that
 * player's own score, so ordering survives and no single scrub can rescale the
 * pool — a min-based shift would let the worst player in the league decide how
 * generous every fairness and overpay ratio looks.
 */
export const replacementScaledValues = (
  values: Map<string, number>,
): Map<string, number> =>
  new Map(
    [...values].map(([playerId, value]) => [
      playerId,
      Math.log1p(Math.exp(value)),
    ]),
  )

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
