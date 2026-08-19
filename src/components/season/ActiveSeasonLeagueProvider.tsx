"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  clearActiveSeasonLeagueId,
  readActiveSeasonLeagueId,
  writeActiveSeasonLeagueId,
} from "@/lib/season/activeSeasonLeague"

export type SeasonLeagueListItem = {
  id: string
  name: string
  season: number
  source: "espn" | "manual" | "mixed"
}

type ActiveSeasonLeagueContextValue = {
  activeId: string | null
  leagues: SeasonLeagueListItem[]
  isLoading: boolean
  error: string
  setActiveId: (id: string | null) => void
}

const ActiveSeasonLeagueContext =
  createContext<ActiveSeasonLeagueContextValue | null>(null)

export const ActiveSeasonLeagueProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<SeasonLeagueListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [hasHydrated, setHasHydrated] = useState(false)
  const [hasLoadedLeagues, setHasLoadedLeagues] = useState(false)

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id)

    if (id) {
      writeActiveSeasonLeagueId(id)
      return
    }

    clearActiveSeasonLeagueId()
  }, [])

  useEffect(() => {
    setActiveIdState(readActiveSeasonLeagueId())
    setHasHydrated(true)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadLeagues = async () => {
      try {
        const response = await fetch("/api/season-leagues", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Unable to load season leagues")

        setLeagues((await response.json()) as SeasonLeagueListItem[])
        setHasLoadedLeagues(true)
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load season leagues",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadLeagues()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!hasHydrated || !hasLoadedLeagues || !activeId) return
    if (leagues.some((league) => league.id === activeId)) return

    clearActiveSeasonLeagueId()
    setActiveIdState(null)
  }, [activeId, hasHydrated, hasLoadedLeagues, leagues])

  const value = useMemo(
    () => ({ activeId, leagues, isLoading, error, setActiveId }),
    [activeId, error, isLoading, leagues, setActiveId],
  )

  return (
    <ActiveSeasonLeagueContext.Provider value={value}>
      {children}
    </ActiveSeasonLeagueContext.Provider>
  )
}

export const useActiveSeasonLeague = (): ActiveSeasonLeagueContextValue => {
  const context = useContext(ActiveSeasonLeagueContext)

  if (!context) {
    throw new Error(
      "useActiveSeasonLeague must be used within ActiveSeasonLeagueProvider",
    )
  }

  return context
}
