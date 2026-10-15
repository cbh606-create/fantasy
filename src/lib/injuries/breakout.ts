import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { BreakoutStatLines, RateLine } from "./breakoutStats"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"

export type BreakoutReason = "rates" | "lineup"

export type BreakoutPlayer = BreakoutStatLines & { id: string }

export type BreakoutSelectionInputs = {
  players: readonly BreakoutPlayer[]
  availablePlayerIds: readonly string[]
  lineups: readonly ConfirmedLineup[]
  depth: DepthChart
  updates: readonly InjuryUpdate[]
  crosswalk: ReadonlyMap<string, string>
  now: Date
}

export type BreakoutPick = {
  playerId: string
  reasons: BreakoutReason[]
}

const zSum = (
  line: RateLine | null,
  pool: readonly RateLine[],
): number | null => {
  if (!line?.rates) return null
  const samples = pool.flatMap((item) => (item.rates ? [item.rates] : []))
  if (samples.length === 0) return null

  return ALL_CATEGORY_IDS.reduce((sum, categoryId) => {
    const values = samples.map((sample) => sample[categoryId])
    const mean = values.reduce((total, value) => total + value, 0) / values.length
    const deviation = Math.sqrt(
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
    )
    const value = line.rates?.[categoryId] ?? mean
    const z =
      deviation === 0
        ? categoryId === "TO"
          ? mean - value
          : value - mean
        : categoryId === "TO"
          ? (mean - value) / deviation
          : (value - mean) / deviation
    return sum + z
  }, 0)
}

const sideUp = (
  recent: RateLine | null,
  baseline: RateLine | null,
  recentPool: readonly RateLine[],
  baselinePool: readonly RateLine[],
): { minutes: boolean | null; value: boolean | null } => {
  const minutes =
    recent?.minutesPerGame != null && baseline?.minutesPerGame != null
      ? recent.minutesPerGame > baseline.minutesPerGame
      : null
  const recentZ = zSum(recent, recentPool)
  const baselineZ = zSum(baseline, baselinePool)
  const value = recentZ !== null && baselineZ !== null ? recentZ > baselineZ : null
  return { minutes, value }
}

const ratesReason = (
  player: BreakoutPlayer,
  players: readonly BreakoutPlayer[],
): boolean => {
  const games = player.seasonGames
  if (games === null || !(games > 0)) return false
  const projectionPool = players.flatMap((item) => (item.projection ? [item.projection] : []))
  const seasonPool = players.flatMap((item) => (item.season ? [item.season] : []))

  if (games <= 7) {
    const sides = sideUp(player.season, player.projection, projectionPool, projectionPool)
    if (games <= 3) return sides.minutes === true || sides.value === true
    return sides.minutes === true && sides.value === true
  }

  if (!player.last7 || player.last7.gamesPlayed < 4) return false
  const sides = sideUp(player.last7, player.season, seasonPool, seasonPool)
  return sides.minutes === true && sides.value === true
}

export const selectBreakouts = (inputs: BreakoutSelectionInputs): BreakoutPick[] => {
  const available = new Set(inputs.availablePlayerIds)
  return inputs.players.flatMap((player) => {
    if (!available.has(player.id) || !ratesReason(player, inputs.players)) return []
    return [{ playerId: player.id, reasons: ["rates"] as BreakoutReason[] }]
  })
}
