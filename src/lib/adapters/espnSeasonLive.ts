import { EspnAdapterError } from "./errors"
import {
  mapEspnLeagueToSeasonState,
  type EspnLeaguePayload,
} from "./espnSeasonMap"
import type { SeasonLeagueState } from "@/lib/season/types"

const FETCH_TIMEOUT_MS = 15_000

const readCookieEnv = (): { espnS2: string; swid: string } => {
  const espnS2 = process.env.ESPN_S2?.trim() ?? ""
  const swidRaw = process.env.ESPN_SWID?.trim() ?? ""
  const swid =
    swidRaw && !swidRaw.startsWith("{") ? `{${swidRaw}}` : swidRaw

  if (!espnS2 || !swid) {
    throw new EspnAdapterError("ESPN_AUTH")
  }

  return { espnS2, swid }
}

export const fetchEspnSeasonLeague = async (params: {
  leagueId: string
  season: number
  teamId: number
}): Promise<SeasonLeagueState> => {
  const { espnS2, swid } = readCookieEnv()
  const url = new URL(
    `https://fantasy.espn.com/apis/v3/games/fba/seasons/${params.season}/segments/0/leagues/${params.leagueId}`,
  )
  url.searchParams.append("view", "mTeam")
  url.searchParams.append("view", "mRoster")
  url.searchParams.append("view", "mSettings")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
      },
      signal: controller.signal,
    })

    if (response.status === 401 || response.status === 403) {
      throw new EspnAdapterError("ESPN_AUTH")
    }

    if (!response.ok) {
      throw new EspnAdapterError("ESPN_UNAVAILABLE")
    }

    const payload = (await response.json()) as EspnLeaguePayload
    return mapEspnLeagueToSeasonState(payload, params)
  } catch (error) {
    if (error instanceof EspnAdapterError) throw error

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EspnAdapterError("ESPN_TIMEOUT")
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new EspnAdapterError("ESPN_TIMEOUT")
    }

    throw new EspnAdapterError("ESPN_UNAVAILABLE")
  } finally {
    clearTimeout(timeout)
  }
}
