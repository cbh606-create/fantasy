"use client"

import { useEffect } from "react"
import { useActiveSeasonLeague } from "@/components/season/ActiveSeasonLeagueProvider"

export const useSyncActiveSeasonLeague = (leagueId: string) => {
  const { activeId, setActiveId } = useActiveSeasonLeague()

  useEffect(() => {
    if (leagueId && leagueId !== activeId) {
      setActiveId(leagueId)
    }
  }, [activeId, leagueId, setActiveId])
}
