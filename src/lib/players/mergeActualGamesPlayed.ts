export type ActualStatRow = {
  id?: string
  seasonId?: number
  statSourceId?: number
  statSplitTypeId?: number
  stats?: Record<string, number>
}

type PlayerWithProjections = {
  espnId?: string
  projections: unknown
  projectedGames?: number
}

const GAMES_STAT_KEY = "42"

const positiveGames = (row: ActualStatRow | undefined): number | null => {
  const games = row?.stats?.[GAMES_STAT_KEY]
  if (typeof games !== "number" || !Number.isFinite(games) || games <= 0) return null
  return games
}

export const actualGamesPlayed = (
  rows: readonly ActualStatRow[],
  seasonId: number,
): number | null => {
  const actualId = `00${seasonId}`
  const byActualId = rows.find((row) => row.id === actualId)
  if (byActualId) return positiveGames(byActualId)

  const bySeasonSplit = rows.find(
    (row) =>
      row.seasonId === seasonId &&
      row.statSourceId === 0 &&
      row.statSplitTypeId === 0,
  )
  return positiveGames(bySeasonSplit)
}

export const mergeActualGamesPlayed = <T extends PlayerWithProjections>(
  players: readonly T[],
  gamesByEspnId: Record<string, number>,
): Array<T & { projectedGames?: number }> =>
  players.map((player) => {
    const espnId = player.espnId
    if (!espnId) return player
    const games = gamesByEspnId[espnId]
    if (typeof games !== "number" || !Number.isFinite(games) || games <= 0) return player
    return {
      ...player,
      projectedGames: games,
    }
  })
