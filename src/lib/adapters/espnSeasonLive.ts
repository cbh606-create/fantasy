import { EspnAdapterError } from "./errors"
import {
  mapEspnLeagueToSeasonState,
  type EspnLeaguePayload,
} from "./espnSeasonMap"
import {
  readEnvEspnCookies,
  type EspnCookies,
} from "@/lib/espn/cookies"
import type { SeasonLeagueState } from "@/lib/season/types"

const FETCH_TIMEOUT_MS = 15_000

const resolveCookies = (cookies?: EspnCookies): EspnCookies => {
  const resolved = cookies ?? readEnvEspnCookies()
  if (!resolved) {
    throw new EspnAdapterError("ESPN_AUTH", "missing cookies")
  }
  return resolved
}

const parseEspnJson = async (response: Response): Promise<EspnLeaguePayload> => {
  const contentType = response.headers.get("content-type") ?? ""
  const bodyText = await response.text()

  if (
    !contentType.includes("application/json") ||
    bodyText.trimStart().startsWith("<")
  ) {
    throw new EspnAdapterError(
      "ESPN_AUTH",
      "ESPN returned a login page instead of league JSON — cookies are missing, expired, or wrong",
    )
  }

  try {
    return JSON.parse(bodyText) as EspnLeaguePayload
  } catch {
    throw new EspnAdapterError(
      "ESPN_UNAVAILABLE",
      "ESPN response was not valid JSON",
    )
  }
}

export const fetchEspnSeasonLeague = async (params: {
  leagueId: string
  season: number
  teamId: number
  cookies?: EspnCookies
}): Promise<SeasonLeagueState> => {
  const { espnS2, swid } = resolveCookies(params.cookies)
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
        Accept: "application/json, text/plain, */*",
        Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
        "User-Agent":
          "Mozilla/5.0 (compatible; FantasyMatchupAdvisor/1.0; +local)",
      },
      redirect: "manual",
      signal: controller.signal,
    })

    if (
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308
    ) {
      throw new EspnAdapterError(
        "ESPN_AUTH",
        `ESPN redirected (${response.status}) — private league cookies rejected`,
      )
    }

    if (response.status === 401 || response.status === 403) {
      throw new EspnAdapterError(
        "ESPN_AUTH",
        `HTTP ${response.status} — check espn_s2/SWID for this ESPN account`,
      )
    }

    if (!response.ok) {
      throw new EspnAdapterError(
        "ESPN_UNAVAILABLE",
        `HTTP ${response.status} from ESPN league API`,
      )
    }

    const payload = await parseEspnJson(response)
    return mapEspnLeagueToSeasonState(payload, params)
  } catch (error) {
    if (error instanceof EspnAdapterError) throw error

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EspnAdapterError("ESPN_TIMEOUT")
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new EspnAdapterError("ESPN_TIMEOUT")
    }

    throw new EspnAdapterError(
      "ESPN_UNAVAILABLE",
      error instanceof Error ? error.message : "unknown fetch error",
    )
  } finally {
    clearTimeout(timeout)
  }
}
