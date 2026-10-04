/**
 * ESPN projections-page rank (draftRanksByRankType.STANDARD), not ADP.
 */

export const espnRankFromPlayer = (row) => {
  const player = row?.player || row
  const rank = Number(player?.draftRanksByRankType?.STANDARD?.rank)
  if (!Number.isFinite(rank) || rank <= 0) return null
  return rank
}
