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

/** Last 3 matchup days — looser swap / thin-fill policy. */
export const isLateStreamingWeek = (
  dayIndex: number,
  dayCount: number,
): boolean => dayIndex >= Math.max(0, dayCount - 3)

/**
 * Do not ration adds across days. Spend remaining budget today when a
 * legal add increases starts or contested score.
 */
export const dailyAddPaceLimit = (
  remainingAdds: number,
  remainingDays: number,
): number => {
  if (remainingAdds <= 0 || remainingDays <= 0) return 0
  return remainingAdds
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
  mode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
  context?: ThinFillContext,
): boolean => {
  if (context?.fillsEmptySlot || context?.noDenserFa) return true
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

export type EarlySwapContext = {
  increasesStarts?: boolean
  improvesContested?: boolean
}

/**
 * Same-tier swap is allowed when it adds starts or contested score.
 * Density upgrades are always allowed.
 */
export const allowsMultiSpotEarlySwap = (
  mode: StreamingStrategyMode,
  heldRank: number,
  newRank: number,
  dayIndex: number,
  dayCount: number,
  budgetBehind = false,
  context?: EarlySwapContext,
): boolean => {
  if (context?.increasesStarts || context?.improvesContested) return true
  if (newRank > heldRank) return true
  if (budgetBehind) {
    if (mode === "aggressive") return newRank >= heldRank
    return allowsEarlySwap(mode, heldRank, newRank)
  }
  if (isLateStreamingWeek(dayIndex, dayCount)) {
    return allowsEarlySwap(mode, heldRank, newRank)
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
