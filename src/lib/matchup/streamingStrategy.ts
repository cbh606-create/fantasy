import type { StreamingDensityTier } from "./types"

export const densityTierRank = (tier: StreamingDensityTier): number => {
  switch (tier) {
    case "elite":
      return 3
    case "strong":
      return 2
    case "ok":
      return 1
    case "thin":
      return 0
  }
}

/** Hard per-spot add split. 7/2 → 4,3; 7/3 → 3,2,2. */
export const addCapForSpot = (
  addLimit: number,
  spotCount: number,
  spotIndex: number,
): number => {
  if (spotCount <= 0) return 0
  const base = Math.floor(addLimit / spotCount)
  const remainder = addLimit % spotCount
  return base + (spotIndex < remainder ? 1 : 0)
}

/** Weekly addLimit is the only hard cap. Spot cap may overflow to add a start. */
export const canSpotSpendAdd = (
  addsUsed: number,
  addLimit: number,
  usedOnSpot: number,
  spotCap: number,
  increasesStarts: boolean,
): boolean => {
  if (addsUsed >= addLimit || addLimit <= 0) return false
  if (usedOnSpot < spotCap) return true
  return increasesStarts
}

/** Last 3 matchup days — looser swap / thin-fill policy. */
export const isLateStreamingWeek = (
  dayIndex: number,
  dayCount: number,
): boolean => dayIndex >= Math.max(0, dayCount - 3)

/**
 * Spread remaining adds across remaining days. Keep later-day blocks
 * funded instead of spending the weekly budget today.
 */
export const dailyAddPaceLimit = (
  remainingAdds: number,
  remainingDays: number,
  emptySpots = 1,
): number => {
  if (remainingAdds <= 0 || remainingDays <= 0) return 0
  if (remainingDays === 1) return remainingAdds
  const even = Math.max(1, Math.ceil(remainingAdds / remainingDays))
  const catchUp = remainingAdds - (remainingDays - 1)
  let cap = even
  if (emptySpots >= 2) cap = Math.max(cap, emptySpots)
  if (remainingDays <= 3) cap = Math.max(cap, catchUp)
  return Math.min(remainingAdds, cap)
}

/**
 * True when finishing the weekly add budget requires ≥1 add per remaining day.
 * Used to loosen swap gates / raise swap pace (catch-up).
 */
export const isAddBudgetBehind = (
  remainingAdds: number,
  remainingDays: number,
): boolean => remainingAdds >= remainingDays && remainingDays > 0 && remainingAdds > 0

/**
 * Swap-only daily cap. When behind, allow enough swaps today to still finish
 * (leave at most one add per later day).
 */
export const dailySwapPaceLimit = (
  remainingAdds: number,
  remainingDays: number,
): number => {
  if (remainingAdds <= 0 || remainingDays <= 0) return 0
  const even = dailyAddPaceLimit(remainingAdds, remainingDays)
  if (!isAddBudgetBehind(remainingAdds, remainingDays)) return even
  const catchUp = remainingAdds - (remainingDays - 1)
  return Math.max(even, catchUp)
}

export type ThinFillContext = {
  fillsEmptySlot?: boolean
  noDenserFa?: boolean
}

export const allowsThinFill = (
  dayIndex: number,
  dayCount: number,
  context?: ThinFillContext,
): boolean => {
  if (context?.fillsEmptySlot || context?.noDenserFa) return true
  return isLateStreamingWeek(dayIndex, dayCount)
}

export const allowsEarlySwap = (heldRank: number, newRank: number): boolean =>
  newRank - heldRank >= 2

export type EarlySwapContext = {
  increasesStarts?: boolean
  improvesContested?: boolean
}

/**
 * Same-tier swap is allowed when it adds starts or contested score.
 * Density upgrades are always allowed.
 */
export const allowsMultiSpotEarlySwap = (
  heldRank: number,
  newRank: number,
  dayIndex: number,
  dayCount: number,
  budgetBehind = false,
  context?: EarlySwapContext,
): boolean => {
  if (context?.increasesStarts || context?.improvesContested) return true
  if (newRank > heldRank) return true
  if (budgetBehind || isLateStreamingWeek(dayIndex, dayCount)) {
    return allowsEarlySwap(heldRank, newRank)
  }
  return false
}

/**
 * Off-night upgrade: strong+ early week; late week or catch-up any today block.
 */
export const allowsMultiSpotOffNightUpgrade = (
  tier: StreamingDensityTier,
  dayIndex: number,
  dayCount: number,
  budgetBehind = false,
): boolean => {
  if (budgetBehind || isLateStreamingWeek(dayIndex, dayCount)) return true
  return densityTierRank(tier) >= densityTierRank("strong")
}
