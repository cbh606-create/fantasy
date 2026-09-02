/**
 * Shared ESPN kona_player_info season-stat selection.
 * Prefer projected rows (id 10YYYY / statSourceId=1) over actuals (00YYYY / source 0).
 */

export const STAT = {
  PTS: "0",
  BLK: "1",
  STL: "2",
  AST: "3",
  REB: "6",
  TO: "11",
  FGM: "13",
  FGA: "14",
  FTM: "15",
  FTA: "16",
  TPM: "17",
  FG_PCT: "19",
  FT_PCT: "20",
  GP: "42",
}

export const num = (stats, key, fallback = 0) => {
  const value = stats?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export const hasCountingStats = (stats) => {
  if (!stats) return false
  return (
    num(stats, STAT.PTS) > 0 ||
    num(stats, STAT.REB) > 0 ||
    num(stats, STAT.AST) > 0 ||
    num(stats, STAT.TPM) > 0
  )
}

const asPick = (entry, kind) => ({
  id: entry.id,
  stats: entry.stats,
  seasonId: entry.seasonId,
  statSourceId: entry.statSourceId,
  kind,
})

export const pickProjectedStats = (player, seasonId) => {
  const stats = Array.isArray(player.stats) ? player.stats : []
  const projectedId = `10${seasonId}`
  const byId = stats.find(
    (entry) => entry.id === projectedId && entry.stats && hasCountingStats(entry.stats),
  )
  if (byId) return asPick(byId, "projection")

  const projected = stats.filter(
    (entry) =>
      entry.seasonId === seasonId &&
      entry.statSourceId === 1 &&
      entry.stats &&
      hasCountingStats(entry.stats) &&
      (entry.statSplitTypeId === 0 || entry.statSplitTypeId === 1),
  )
  projected.sort((a, b) => (a.statSplitTypeId ?? 99) - (b.statSplitTypeId ?? 99))
  if (projected[0]) return asPick(projected[0], "projection")
  return null
}

export const pickActualStats = (player, seasonId) => {
  const stats = Array.isArray(player.stats) ? player.stats : []
  const actualId = `00${seasonId}`
  const byId = stats.find(
    (entry) => entry.id === actualId && entry.stats && hasCountingStats(entry.stats),
  )
  if (byId) return asPick(byId, "actual")

  const actuals = stats.filter(
    (entry) =>
      entry.seasonId === seasonId &&
      entry.statSourceId === 0 &&
      entry.stats &&
      hasCountingStats(entry.stats) &&
      (entry.statSplitTypeId === 0 || entry.statSplitTypeId === 1),
  )
  actuals.sort((a, b) => (a.statSplitTypeId ?? 99) - (b.statSplitTypeId ?? 99))
  if (actuals[0]) return asPick(actuals[0], "actual")
  return null
}

/**
 * Prefer current-season projections, then prior-season projections,
 * then actuals only as a last resort.
 */
export const pickBestStats = (player, seasonId) =>
  pickProjectedStats(player, seasonId) ||
  pickProjectedStats(player, seasonId - 1) ||
  pickActualStats(player, seasonId) ||
  pickActualStats(player, seasonId - 1)
