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

export const allowsThinFill = (
  mode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
): boolean => {
  if (mode === "aggressive") return true
  return dayIndex >= Math.max(0, dayCount - 3)
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
