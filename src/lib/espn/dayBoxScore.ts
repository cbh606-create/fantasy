import { espnCookieHeader, type EspnCookies } from "@/lib/espn/cookies"
import {
  emptyCategoryTotals,
  type DayActuals,
  type DayShootingTotals,
} from "@/lib/matchup/morningCheck"

export type EspnBoxEntry = {
  playerPoolEntry?: {
    player?: {
      id?: number
      stats?: Array<{ stats?: Record<string, number> }>
    }
  }
}

export type EspnDayBoxPayload = {
  schedule?: Array<{
    matchupPeriodId?: number
    home?: { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] } }
    away?: { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] } }
  }>
}

const STAT = {
  PTS: "0",
  BLK: "1",
  STL: "2",
  AST: "3",
  REB: "6",
  TO: "11",
  FGM: "13",
  FGA: "14",
  FTM: "15",
  FTA: "16",
  TPM: "17",
} as const

const readStat = (row: Record<string, number> | undefined, key: string): number =>
  row?.[key] ?? 0

const playerPlayed = (row: Record<string, number> | undefined): boolean => {
  const pts = readStat(row, STAT.PTS)
  const reb = readStat(row, STAT.REB)
  const ast = readStat(row, STAT.AST)
  const tpm = readStat(row, STAT.TPM)
  const fga = readStat(row, STAT.FGA)
  return pts > 0 || reb > 0 || ast > 0 || tpm > 0 || fga > 0
}

const sumRosterEntries = (
  entries: EspnBoxEntry[] | undefined,
): { totals: ReturnType<typeof emptyCategoryTotals>; shooting: DayShootingTotals; playedIds: string[] } => {
  const totals = emptyCategoryTotals()
  const shooting: DayShootingTotals = { FGM: 0, FGA: 0, FTM: 0, FTA: 0 }
  const playedIds: string[] = []

  for (const entry of entries ?? []) {
    const player = entry.playerPoolEntry?.player
    if (player?.id == null) continue
    const statRow = player.stats?.[0]?.stats
    if (!statRow) continue

    totals.PTS += readStat(statRow, STAT.PTS)
    totals.BLK += readStat(statRow, STAT.BLK)
    totals.STL += readStat(statRow, STAT.STL)
    totals.AST += readStat(statRow, STAT.AST)
    totals.REB += readStat(statRow, STAT.REB)
    totals.TO += readStat(statRow, STAT.TO)
    totals.TPM += readStat(statRow, STAT.TPM)

    shooting.FGM += readStat(statRow, STAT.FGM)
    shooting.FGA += readStat(statRow, STAT.FGA)
    shooting.FTM += readStat(statRow, STAT.FTM)
    shooting.FTA += readStat(statRow, STAT.FTA)

    if (playerPlayed(statRow)) {
      playedIds.push(String(player.id))
    }
  }

  totals.FG_PCT = shooting.FGA > 0 ? shooting.FGM / shooting.FGA : 0
  totals.FT_PCT = shooting.FTA > 0 ? shooting.FTM / shooting.FTA : 0

  return { totals, shooting, playedIds }
}

type ScheduleSide = {
  teamId?: number
  rosterForCurrentScoringPeriod?: { entries?: EspnBoxEntry[] }
}

const findMatchupSides = (
  schedule: EspnDayBoxPayload["schedule"],
  youTeamId: number,
  oppTeamId: number,
): { youSide: ScheduleSide | undefined; oppSide: ScheduleSide | undefined } => {
  for (const matchup of schedule ?? []) {
    const homeId = matchup.home?.teamId
    const awayId = matchup.away?.teamId

    if (homeId === youTeamId) {
      const oppSide = awayId === oppTeamId ? matchup.away : undefined
      return { youSide: matchup.home, oppSide }
    }
    if (awayId === youTeamId) {
      const oppSide = homeId === oppTeamId ? matchup.home : undefined
      return { youSide: matchup.away, oppSide }
    }
  }
  return { youSide: undefined, oppSide: undefined }
}

export const mapEspnDayBoxScore = (input: {
  payload: EspnDayBoxPayload
  date: string
  youTeamId: number
  oppTeamId: number
}): DayActuals | null => {
  const { payload, date, youTeamId, oppTeamId } = input
  const { youSide, oppSide } = findMatchupSides(payload.schedule, youTeamId, oppTeamId)

  if (!youSide) {
    return null
  }

  const youEntries = youSide.rosterForCurrentScoringPeriod?.entries
  const oppEntries = oppSide?.rosterForCurrentScoringPeriod?.entries

  const you = sumRosterEntries(youEntries)
  const opp = sumRosterEntries(oppEntries)

  return {
    date,
    you: you.totals,
    opp: opp.totals,
    youPlayedIds: you.playedIds,
    oppPlayedIds: opp.playedIds,
    youShooting: you.shooting,
    oppShooting: opp.shooting,
  }
}

const FETCH_TIMEOUT_MS = 15_000
const DAY_MS = 24 * 60 * 60 * 1000

type EspnLeagueStatus = {
  status?: {
    currentScoringPeriod?: number
    currentMatchupPeriod?: number
  }
}

const leagueUrl = (season: number, leagueId: string): URL =>
  new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leagues/${leagueId}`,
  )

const fetchEspnJson = async (
  url: URL,
  cookies: EspnCookies,
  fetchImpl: typeof fetch,
  extraHeaders?: Record<string, string>,
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
        ...extraHeaders,
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

const daysBetween = (fromDate: string, toDate: string): number =>
  Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS)

export const fetchEspnDayActuals = async (params: {
  leagueId: string
  season: number
  cookies: EspnCookies
  dates: string[]
  today: string
  youTeamId: number
  oppTeamId: number
  fetchImpl?: typeof fetch
}): Promise<Map<string, DayActuals>> => {
  const fetchImpl = params.fetchImpl ?? fetch
  const actualsByDate = new Map<string, DayActuals>()
  if (params.dates.length === 0) return actualsByDate

  const settingsUrl = leagueUrl(params.season, params.leagueId)
  settingsUrl.searchParams.append("view", "mSettings")
  const settings = (await fetchEspnJson(
    settingsUrl,
    params.cookies,
    fetchImpl,
  )) as EspnLeagueStatus
  const currentScoringPeriod = settings.status?.currentScoringPeriod
  const currentMatchupPeriod = settings.status?.currentMatchupPeriod
  if (currentScoringPeriod == null || currentMatchupPeriod == null) {
    throw new Error("espn_status_missing")
  }

  const payloads = await Promise.all(
    params.dates.map(async (date) => {
      const url = leagueUrl(params.season, params.leagueId)
      url.searchParams.append("view", "mScoreboard")
      url.searchParams.append("view", "mMatchupScore")
      url.searchParams.set(
        "scoringPeriodId",
        String(currentScoringPeriod - daysBetween(date, params.today)),
      )
      const payload = (await fetchEspnJson(url, params.cookies, fetchImpl, {
        "X-Fantasy-Filter": JSON.stringify({
          schedule: {
            filterMatchupPeriodIds: { value: [currentMatchupPeriod] },
          },
        }),
      })) as EspnDayBoxPayload
      return { date, payload }
    }),
  )

  for (const { date, payload } of payloads) {
    const actuals = mapEspnDayBoxScore({
      payload,
      date,
      youTeamId: params.youTeamId,
      oppTeamId: params.oppTeamId,
    })
    if (actuals) actualsByDate.set(date, actuals)
  }
  return actualsByDate
}
