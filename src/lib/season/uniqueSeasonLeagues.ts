type SeasonLeagueIdentity = {
  id: string
  espnLeagueId: string | null
  season: number
  createdAt: Date
  updatedAt: Date
}

const identityKey = (league: SeasonLeagueIdentity): string =>
  league.espnLeagueId
    ? `${league.espnLeagueId}:${league.season}`
    : `id:${league.id}`

export const dedupeSeasonLeagues = <T extends SeasonLeagueIdentity>(
  leagues: T[],
): T[] => {
  const kept = new Map<string, T>()

  for (const league of leagues) {
    const key = identityKey(league)
    const current = kept.get(key)
    if (!current || league.createdAt < current.createdAt) {
      kept.set(key, league)
    }
  }

  return [...kept.values()].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  )
}
