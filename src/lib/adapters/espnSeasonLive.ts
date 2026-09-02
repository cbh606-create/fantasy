import { EspnAdapterError } from "./errors"
import {
  mapEspnFreeAgentPlayers,
  mapEspnLeagueToSeasonState,
  type EspnFreeAgentsPayload,
  type EspnLeaguePayload,
} from "./espnSeasonMap"
import {
  deriveAvailableFromOwnership,
  mergeAvailablePlayers,
} from "./espnAvailable"
import {
  readEnvEspnCookies,
  type EspnCookies,
} from "@/lib/espn/cookies"
import { applyPoolProjections } from "@/lib/players/applyPoolProjections"
import { loadProjPoolPlayers } from "@/lib/players/loadProjPool"
import type { SeasonLeagueState } from "@/lib/season/types"

const FETCH_TIMEOUT_MS = 15_000

const overlayPoolProjections = async (
  state: SeasonLeagueState,
): Promise<SeasonLeagueState> => {
  try {
    const poolPlayers = await loadProjPoolPlayers()
    const { players } = applyPoolProjections(state.players, poolPlayers)
    return { ...state, players }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    console.warn(
      `ESPN pool projection overlay skipped; using live-mapped stats: ${message}`,
    )
    return state
  }
}

const resolveCookies = (cookies?: EspnCookies): EspnCookies => {
  const resolved = cookies ?? readEnvEspnCookies()
  if (!resolved) {
    throw new EspnAdapterError("ESPN_AUTH", "missing cookies")
  }
  return resolved
}

const espnHeaders = (cookies: EspnCookies): Record<string, string> => ({
  Accept: "application/json, text/plain, */*",
  // Keep SWID braces raw; percent-encode espn_s2 so `/` and `+` survive Cookie.
  Cookie: `espn_s2=${encodeURIComponent(cookies.espnS2)}; SWID=${cookies.swid}`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
})

const parseEspnJson = async <Payload>(response: Response): Promise<Payload> => {
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
    return JSON.parse(bodyText) as Payload
  } catch {
    throw new EspnAdapterError(
      "ESPN_UNAVAILABLE",
      "ESPN response was not valid JSON",
    )
  }
}

const fetchEspnFreeAgents = async (
  params: {
    leagueId: string
    season: number
  },
  cookies: EspnCookies,
) => {
  const faUrl = new URL(
    `https://fantasy.espn.com/apis/v3/games/fba/seasons/${params.season}/segments/0/leagues/${params.leagueId}`,
  )
  faUrl.searchParams.append("view", "kona_player_info")

  const fantasyFilter = JSON.stringify({
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      limit: 200,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
    },
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(faUrl, {
      headers: {
        ...espnHeaders(cookies),
        "X-Fantasy-Filter": fantasyFilter,
      },
      redirect: "manual",
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new EspnAdapterError(
        "ESPN_UNAVAILABLE",
        `HTTP ${response.status} from ESPN free-agent API`,
      )
    }

    const payload = await parseEspnJson<EspnFreeAgentsPayload>(response)
    return mapEspnFreeAgentPlayers(payload, params.season)
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchEspnSeasonLeague = async (params: {
  leagueId: string
  season: number
  teamId: number
  cookies?: EspnCookies
}): Promise<SeasonLeagueState> => {
  const cookies = resolveCookies(params.cookies)
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
      headers: espnHeaders(cookies),
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

    const payload = await parseEspnJson<EspnLeaguePayload>(response)
    let state = mapEspnLeagueToSeasonState(payload, params)

    try {
      const faPlayers = await fetchEspnFreeAgents(params, cookies)
      if (faPlayers.length > 0) {
        state = mergeAvailablePlayers(state, faPlayers, "espn_fa")
        return overlayPoolProjections(state)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error"
      console.warn(
        `ESPN free-agent fetch failed; using ownership-based availability: ${message}`,
      )
    }

    const ownershipIds = deriveAvailableFromOwnership(state)
    if (ownershipIds.length === 0) {
      return overlayPoolProjections({ ...state, availablePlayerIds: [] })
    }

    const ownershipPlayers = state.players.filter((player) =>
      ownershipIds.includes(player.id),
    )
    return overlayPoolProjections(
      mergeAvailablePlayers(state, ownershipPlayers, "ownership"),
    )  } catch (error) {
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
