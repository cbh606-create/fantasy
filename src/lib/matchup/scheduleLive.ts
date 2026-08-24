import scheduleFixture from "../../../data/fixtures/nba-matchup-schedule.json"
import seasonScheduleFile from "../../../data/fixtures/nba-schedule-2026-27.json"
import { buildWeekDays, formatUtcIsoDate, parseIsoDate } from "@/lib/matchup/scheduleDates"
import { nextWeekWithGames } from "@/lib/matchup/scheduleSeason"
import type { ScheduleGame, ScheduleResponse } from "@/lib/season/types"

export { buildWeekDays } from "@/lib/matchup/scheduleDates"

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
const CACHE_TTL_MS = 20 * 60 * 1000
const NEW_YORK_TIME_ZONE = "America/New_York"
const ESPN_TEAM_ABBR_MAP: Record<string, string> = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  WSH: "WAS",
  UTAH: "UTA",
}

type NormalizeOptions = {
  scoringPeriodId: number
  startIso: string
  endIso: string
}

type GetMatchupScheduleOptions = {
  fetchImpl?: typeof fetch
  now?: Date
}

type EspnCompetitor = {
  homeAway?: unknown
  team?: {
    abbreviation?: unknown
  }
}

type EspnCompetition = {
  date?: unknown
  competitors?: unknown
}

type EspnEvent = {
  date?: unknown
  competitions?: unknown
}

type CachedSchedule = {
  expiresAt: number
  key: string
  schedule: ScheduleResponse
}

let cachedSchedule: CachedSchedule | null = null

export const clearMatchupScheduleCache = () => {
  cachedSchedule = null
}

export const normalizeEspnTeamAbbr = (abbreviation: string): string => {
  const normalized = abbreviation.trim().toUpperCase()
  return ESPN_TEAM_ABBR_MAP[normalized] ?? normalized
}

const formatNewYorkIsoDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const getTeamAbbreviation = (
  competitors: EspnCompetitor[],
  homeAway: "home" | "away",
) => {
  const competitor = competitors.find((entry) => entry.homeAway === homeAway)
  const abbreviation = competitor?.team?.abbreviation
  return typeof abbreviation === "string"
    ? normalizeEspnTeamAbbr(abbreviation)
    : null
}

const normalizeCompetition = (
  competition: EspnCompetition,
  eventDate: unknown,
): ScheduleGame | null => {
  if (!Array.isArray(competition.competitors)) return null

  const competitors = competition.competitors as EspnCompetitor[]
  const homeAbbr = getTeamAbbreviation(competitors, "home")
  const awayAbbr = getTeamAbbreviation(competitors, "away")
  const rawDate = typeof competition.date === "string" ? competition.date : eventDate
  if (!homeAbbr || !awayAbbr || typeof rawDate !== "string") return null

  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return null

  return {
    awayAbbr,
    date: formatNewYorkIsoDate(date),
    homeAbbr,
  }
}

export const normalizeEspnScoreboard = (
  payload: unknown,
  options: NormalizeOptions,
): ScheduleResponse => {
  const events =
    typeof payload === "object" &&
    payload !== null &&
    "events" in payload &&
    Array.isArray(payload.events)
      ? (payload.events as EspnEvent[])
      : []
  const games = events.flatMap((event) => {
    if (!Array.isArray(event.competitions)) return []

    return (event.competitions as EspnCompetition[])
      .map((competition) => normalizeCompetition(competition, event.date))
      .filter((game): game is ScheduleGame => game !== null)
  })

  return {
    games,
    matchup: {
      days: buildWeekDays(options.startIso, options.endIso),
      endDate: options.endIso,
      scoringPeriodId: options.scoringPeriodId,
      startDate: options.startIso,
    },
    source: "live",
  }
}

const getNewYorkWeek = (now: Date) => {
  const todayIso = formatNewYorkIsoDate(now)
  const today = parseIsoDate(todayIso)
  const daysSinceMonday = (today.getUTCDay() + 6) % 7
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)

  return {
    endIso: formatUtcIsoDate(end),
    startIso: formatUtcIsoDate(start),
  }
}

export const getMatchupSchedule = async (
  options: GetMatchupScheduleOptions = {},
): Promise<ScheduleResponse> => {
  // Matchup weeks use the America/New_York local calendar date and run Monday-Sunday.
  const nowDate = options.now ?? new Date()
  const { endIso, startIso } = getNewYorkWeek(nowDate)
  const cacheKey = `${startIso}:${endIso}:v2`
  const now = Date.now()
  if (
    cachedSchedule &&
    cachedSchedule.key === cacheKey &&
    cachedSchedule.expiresAt > now
  ) {
    return cachedSchedule.schedule
  }

  const days = buildWeekDays(startIso, endIso)
  const daySet = new Set(days)
  const lookback = parseIsoDate(startIso)
  lookback.setUTCDate(lookback.getUTCDate() - 1)
  const fetchDays = [formatUtcIsoDate(lookback), ...days]
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const payloads = await Promise.all(
      fetchDays.map(async (day) => {
        const date = day.replaceAll("-", "")
        const response = await fetchImpl(`${ESPN_SCOREBOARD_URL}?dates=${date}`)
        if (!response.ok) throw new Error(`ESPN scoreboard request failed: ${response.status}`)
        return response.json() as Promise<unknown>
      }),
    )
    const scoringPeriodId = Number(startIso.replaceAll("-", ""))
    const schedules = payloads.map((payload) =>
      normalizeEspnScoreboard(payload, { endIso, scoringPeriodId, startIso }),
    )
    const seenGameKeys = new Set<string>()
    const uniqueGames = schedules.flatMap((entry) => entry.games).filter((game) => {
      const key = `${game.date}|${game.homeAbbr}|${game.awayAbbr}`
      if (seenGameKeys.has(key)) return false
      seenGameKeys.add(key)
      return true
    })
    const weekHasGames = uniqueGames.some((game) => daySet.has(game.date))
    if (!weekHasGames) {
      throw new Error("ESPN scoreboard returned no games")
    }

    const schedule: ScheduleResponse = {
      games: uniqueGames,
      matchup: schedules[0].matchup,
      source: "live",
    }

    cachedSchedule = {
      expiresAt: now + CACHE_TTL_MS,
      key: cacheKey,
      schedule,
    }
    return schedule
  } catch {
    const todayIso = formatNewYorkIsoDate(nowDate)
    const season = nextWeekWithGames(seasonScheduleFile.games, todayIso)
    if (!season) return scheduleFixture as ScheduleResponse

    cachedSchedule = {
      expiresAt: now + CACHE_TTL_MS,
      key: cacheKey,
      schedule: season,
    }
    return season
  }
}
