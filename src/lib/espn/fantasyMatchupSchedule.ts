import { espnCookieHeader, type EspnCookies } from "@/lib/espn/cookies"
import {
  formatUtcIsoDate,
  parseIsoDate,
  weekContainingIsoDate,
} from "@/lib/matchup/scheduleDates"
import { normalizeNbaTeamAbbr } from "@/lib/nba/teamAbbr"
import type { ScheduleGame, ScheduleResponse } from "@/lib/season/types"

const FETCH_TIMEOUT_MS = 15_000
const NEW_YORK_TIME_ZONE = "America/New_York"
const CACHE_TTL_MS = 20 * 60 * 1000
/** Product matchup board is always a full fantasy week. */
const WEEKLY_MATCHUP_DAYS = 7

type ProGame = {
  date: number
  scoringPeriodId: number
  homeProTeamId: number
  awayProTeamId: number
}

type ProTeam = {
  id: number
  abbrev?: string
  proGamesByScoringPeriod?: Record<string, ProGame[]>
}

type SeasonSchedulePayload = {
  settings?: {
    proTeams?: ProTeam[]
  }
}

type LeagueMatchupPayload = {
  status?: {
    currentMatchupPeriod?: number
    currentScoringPeriod?: number
    firstScoringPeriod?: number
  }
  settings?: {
    scheduleSettings?: {
      matchupPeriodLength?: number
      matchupPeriods?: Record<string, number[]>
    }
  }
  schedule?: Array<{
    matchupPeriodId?: number
    home?: { teamId?: number }
    away?: { teamId?: number }
  }>
}

export type EspnFantasyMatchupWindow = {
  matchupPeriodId: number
  scoringPeriodIds: number[]
  days: string[]
  opponentEspnTeamId: number | null
  /** True when ESPN period was shorter than a week and we expanded to Mon–Sun. */
  expandedToWeekly: boolean
  schedule: ScheduleResponse
}

type CacheEntry = {
  expiresAt: number
  key: string
  window: EspnFantasyMatchupWindow
}

let cachedWindow: CacheEntry | null = null

export const clearEspnFantasyMatchupCache = () => {
  cachedWindow = null
}

const formatNewYorkIsoDate = (ms: number): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date(ms))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const fetchEspnJson = async (
  url: URL,
  cookies: EspnCookies,
  fetchImpl: typeof fetch,
): Promise<unknown> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Cookie: espnCookieHeader(cookies),
        Origin: "https://fantasy.espn.com",
        Referer: "https://fantasy.espn.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      redirect: "manual",
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`espn_http_${response.status}`)
    return (await response.json()) as unknown
  } finally {
    clearTimeout(timeout)
  }
}

/** Build scoringPeriodId → NY date from pro games, filling off-day gaps. */
export const scoringPeriodDatesFromProTeams = (
  proTeams: ProTeam[],
): Map<number, string> => {
  const known = new Map<number, string>()
  for (const team of proTeams) {
    for (const games of Object.values(team.proGamesByScoringPeriod ?? {})) {
      for (const game of games) {
        if (!Number.isInteger(game.scoringPeriodId) || !game.date) continue
        const iso = formatNewYorkIsoDate(game.date)
        const previous = known.get(game.scoringPeriodId)
        if (previous && previous !== iso) continue
        known.set(game.scoringPeriodId, iso)
      }
    }
  }

  if (known.size === 0) return known

  const ids = [...known.keys()].sort((a, b) => a - b)
  const minId = ids[0]!
  const maxId = ids[ids.length - 1]!
  const anchorId = minId
  const anchorDate = parseIsoDate(known.get(anchorId)!)

  const filled = new Map<number, string>()
  for (let id = minId; id <= maxId; id += 1) {
    const direct = known.get(id)
    if (direct) {
      filled.set(id, direct)
      continue
    }
    const inferred = new Date(anchorDate)
    inferred.setUTCDate(inferred.getUTCDate() + (id - anchorId))
    filled.set(id, formatUtcIsoDate(inferred))
  }
  return filled
}

/** Map calendar days to scoring period ids (infer via day offset from a known anchor). */
export const scoringPeriodIdsForDays = (
  days: string[],
  periodDates: Map<number, string>,
): number[] => {
  if (periodDates.size === 0) {
    throw new Error("espn_scoring_period_dates_empty")
  }

  const idByDate = new Map<string, number>()
  for (const [id, date] of periodDates) {
    idByDate.set(date, id)
  }

  const [anchorId, anchorDate] = [...periodDates.entries()].sort(
    (left, right) => left[0] - right[0],
  )[0]!
  const anchorMs = parseIsoDate(anchorDate).getTime()

  return days.map((date) => {
    const direct = idByDate.get(date)
    if (direct != null) return direct
    const deltaDays = Math.round(
      (parseIsoDate(date).getTime() - anchorMs) / 86_400_000,
    )
    return anchorId + deltaDays
  })
}

export const gamesFromProTeams = (
  proTeams: ProTeam[],
  daySet: Set<string>,
  periodDates: Map<number, string>,
): ScheduleGame[] => {
  const abbrById = new Map<number, string>()
  for (const team of proTeams) {
    if (typeof team.abbrev === "string" && team.abbrev) {
      abbrById.set(team.id, normalizeNbaTeamAbbr(team.abbrev))
    }
  }

  const seen = new Set<string>()
  const games: ScheduleGame[] = []
  for (const team of proTeams) {
    for (const entries of Object.values(team.proGamesByScoringPeriod ?? {})) {
      for (const game of entries) {
        const date =
          periodDates.get(game.scoringPeriodId) ??
          (game.date ? formatNewYorkIsoDate(game.date) : null)
        if (!date || !daySet.has(date)) continue
        const homeAbbr = abbrById.get(game.homeProTeamId)
        const awayAbbr = abbrById.get(game.awayProTeamId)
        if (!homeAbbr || !awayAbbr) continue
        const key = `${date}|${homeAbbr}|${awayAbbr}`
        if (seen.has(key)) continue
        seen.add(key)
        games.push({ date, homeAbbr, awayAbbr })
      }
    }
  }
  return games.sort((a, b) => a.date.localeCompare(b.date))
}

export const opponentEspnTeamIdFromSchedule = (
  schedule: LeagueMatchupPayload["schedule"],
  matchupPeriodId: number,
  youEspnTeamId: number,
): number | null => {
  for (const row of schedule ?? []) {
    if (row.matchupPeriodId !== matchupPeriodId) continue
    const homeId = row.home?.teamId
    const awayId = row.away?.teamId
    if (homeId === youEspnTeamId && typeof awayId === "number") return awayId
    if (awayId === youEspnTeamId && typeof homeId === "number") return homeId
  }
  return null
}

const espnPeriodIsWeekly = (
  scoringPeriodIds: number[],
  matchupPeriodLength: number | undefined,
): boolean => {
  if (scoringPeriodIds.length >= WEEKLY_MATCHUP_DAYS) return true
  if (
    typeof matchupPeriodLength === "number" &&
    matchupPeriodLength >= WEEKLY_MATCHUP_DAYS
  ) {
    return true
  }
  return false
}

export const buildEspnFantasyMatchupWindow = (input: {
  seasonPayload: SeasonSchedulePayload
  leaguePayload: LeagueMatchupPayload
  youEspnTeamId: number
}): EspnFantasyMatchupWindow => {
  const matchupPeriodId = input.leaguePayload.status?.currentMatchupPeriod
  if (matchupPeriodId == null || !Number.isInteger(matchupPeriodId)) {
    throw new Error("espn_matchup_period_missing")
  }

  const espnScoringPeriodIds =
    input.leaguePayload.settings?.scheduleSettings?.matchupPeriods?.[
      String(matchupPeriodId)
    ] ?? []
  if (espnScoringPeriodIds.length === 0) {
    throw new Error("espn_matchup_days_missing")
  }

  const matchupPeriodLength =
    input.leaguePayload.settings?.scheduleSettings?.matchupPeriodLength
  const proTeams = input.seasonPayload.settings?.proTeams ?? []
  const periodDates = scoringPeriodDatesFromProTeams(proTeams)

  const espnDays = espnScoringPeriodIds.map((id) => {
    const date = periodDates.get(id)
    if (!date) throw new Error(`espn_scoring_period_date_missing:${id}`)
    return date
  })

  // Product always uses a Mon–Sun board. ESPN daily leagues (period length 1)
  // still contribute the real opponent for currentMatchupPeriod.
  const expandedToWeekly = !espnPeriodIsWeekly(
    espnScoringPeriodIds,
    matchupPeriodLength,
  )
  const days = expandedToWeekly
    ? weekContainingIsoDate(espnDays[0]!).days
    : espnDays
  const scoringPeriodIds = expandedToWeekly
    ? scoringPeriodIdsForDays(days, periodDates)
    : espnScoringPeriodIds

  const daySet = new Set(days)
  const games = gamesFromProTeams(proTeams, daySet, periodDates)
  const startDate = days[0]!
  const endDate = days[days.length - 1]!
  const opponentEspnTeamId = opponentEspnTeamIdFromSchedule(
    input.leaguePayload.schedule,
    matchupPeriodId,
    input.youEspnTeamId,
  )

  return {
    matchupPeriodId,
    scoringPeriodIds,
    days,
    opponentEspnTeamId,
    expandedToWeekly,
    schedule: {
      source: "live",
      games,
      matchup: {
        scoringPeriodId: matchupPeriodId,
        startDate,
        endDate,
        days,
        scoringPeriodIds,
        matchupPeriodId,
      },
    },
  }
}

export const fetchEspnFantasyMatchupWindow = async (params: {
  leagueId: string
  season: number
  youEspnTeamId: number
  cookies: EspnCookies
  fetchImpl?: typeof fetch
}): Promise<EspnFantasyMatchupWindow> => {
  const fetchImpl = params.fetchImpl ?? fetch
  const cacheKey = `${params.season}:${params.leagueId}:${params.youEspnTeamId}`
  const now = Date.now()
  if (
    cachedWindow &&
    cachedWindow.key === cacheKey &&
    cachedWindow.expiresAt > now
  ) {
    return cachedWindow.window
  }

  const seasonUrl = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${params.season}`,
  )
  seasonUrl.searchParams.set("view", "proTeamSchedules_wl")

  const leagueUrl = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${params.season}/segments/0/leagues/${params.leagueId}`,
  )
  leagueUrl.searchParams.append("view", "mSettings")
  leagueUrl.searchParams.append("view", "mMatchup")
  leagueUrl.searchParams.append("view", "mScoreboard")

  const [seasonPayload, leaguePayload] = await Promise.all([
    fetchEspnJson(seasonUrl, params.cookies, fetchImpl) as Promise<SeasonSchedulePayload>,
    fetchEspnJson(leagueUrl, params.cookies, fetchImpl) as Promise<LeagueMatchupPayload>,
  ])

  const window = buildEspnFantasyMatchupWindow({
    seasonPayload,
    leaguePayload,
    youEspnTeamId: params.youEspnTeamId,
  })

  cachedWindow = {
    key: cacheKey,
    expiresAt: now + CACHE_TTL_MS,
    window,
  }
  return window
}
