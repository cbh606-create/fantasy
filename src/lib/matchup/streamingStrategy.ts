import type {
  MatchupBoard,
  StreamingDensityTier,
  StreamingStrategyMode,
} from "./types"

const MODES: StreamingStrategyMode[] = [
  "aggressive",
  "balanced",
  "conservative",
]

export const normalizeStreamingStrategyMode = (
  value: unknown,
): StreamingStrategyMode =>
  typeof value === "string" &&
  (MODES as string[]).includes(value)
    ? (value as StreamingStrategyMode)
    : "balanced"

export const suggestStreamingStrategyMode = (
  board: MatchupBoard,
): StreamingStrategyMode => {
  const total = board.categories.length
  if (total === 0) return "balanced"
  const behind = board.categories.filter(
    (row) => row.outcome === "L" || row.outcome === "T",
  ).length
  const behindRatio = behind / total
  if (behindRatio >= 0.5) return "aggressive"
  if (behindRatio <= 0.15) return "conservative"
  return "balanced"
}

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

export const softCapForSpot = (
  addLimit: number,
  spotCount: number,
  mode: StreamingStrategyMode,
): number => {
  const base = Math.ceil(addLimit / spotCount)
  return mode === "aggressive" ? base + 1 : base
}

/** Last 3 matchup days — looser swap / thin-fill policy. */
export const isLateStreamingWeek = (
  dayIndex: number,
  dayCount: number,
): boolean => dayIndex >= Math.max(0, dayCount - 3)

/**
 * Pace weekly adds across remaining days (2/3-spot).
 * Example: 7 adds / 7 days → 1 per day early; leftover stacks late.
 */
export const dailyAddPaceLimit = (
  remainingAdds: number,
  remainingDays: number,
): number => {
  if (remainingAdds <= 0 || remainingDays <= 0) return 0
  return Math.max(1, Math.ceil(remainingAdds / remainingDays))
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

export const allowsThinFill = (
  mode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
): boolean => {
  if (mode === "aggressive") return true
  return isLateStreamingWeek(dayIndex, dayCount)
}

export const allowsAddForTier = (
  mode: StreamingStrategyMode,
  tier: StreamingDensityTier,
): boolean => {
  if (mode === "conservative") {
    return tier === "elite" || tier === "strong" || tier === "ok"
  }
  return true
}

export const allowsEarlySwap = (
  mode: StreamingStrategyMode,
  heldRank: number,
  newRank: number,
): boolean => {
  const delta = newRank - heldRank
  if (mode === "aggressive") return delta >= 1
  return delta >= 2
}

/**
 * 2/3-spot early-week swaps: elite upgrade, or +2 tiers.
 * Late week uses allowsEarlySwap; budget catch-up allows same-tier churn on aggressive.
 */
export const allowsMultiSpotEarlySwap = (
  mode: StreamingStrategyMode,
  heldRank: number,
  newRank: number,
  dayIndex: number,
  dayCount: number,
  budgetBehind = false,
): boolean => {
  if (budgetBehind) {
    if (mode === "aggressive") return newRank >= heldRank
    return allowsEarlySwap(mode, heldRank, newRank)
  }
  if (isLateStreamingWeek(dayIndex, dayCount)) {
    return allowsEarlySwap(mode, heldRank, newRank)
  }
  if (newRank >= densityTierRank("elite")) return true
  return newRank - heldRank >= 2
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
