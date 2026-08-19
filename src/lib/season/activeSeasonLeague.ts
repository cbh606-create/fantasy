export const ACTIVE_SEASON_LEAGUE_STORAGE_KEY = "activeSeasonLeagueId"

export const readActiveSeasonLeagueId = (): string | null => {
  if (typeof window === "undefined") {
    return null
  }

  return window.localStorage.getItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)
}

export const writeActiveSeasonLeagueId = (id: string): void => {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY, id)
}

export const clearActiveSeasonLeagueId = (): void => {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(ACTIVE_SEASON_LEAGUE_STORAGE_KEY)
}
