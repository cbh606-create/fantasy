import type { CategoryId } from "@/lib/domain/types"
import type { EspnCookies } from "@/lib/espn/cookies"
import {
  buildWinnerStreamRecipes,
  type WinnerStreamAddEvent,
  type WinnerStreamMatchupBox,
  type WinnerStreamRecipe,
  type WinnerStreamTeamBox,
} from "@/lib/matchup/winnerStreamPrior"
import type { SeasonPlayer } from "@/lib/season/types"

const FETCH_TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const MAX_SCOREBOARD_PERIODS = 20

const ESPN_STAT_TO_CATEGORY: Record<string, CategoryId> = {
  "0": "PTS",
  "1": "BLK",
  "2": "STL",
  "3": "AST",
  "6": "REB",
  "11": "TO",
  "17": "TPM",
  "19": "FG_PCT",
  "20": "FT_PCT",
}

type EspnScoreByStat = Record<
  string,
  { result?: string; score?: number } | undefined
>

type EspnCumulativeScore = {
  wins?: number
  losses?: number
  ties?: number
  scoreByStat?: EspnScoreByStat
}

type EspnScheduleSide = {
  teamId?: number
  cumulativeScore?: EspnCumulativeScore
}

type EspnScheduleMatchup = {
  matchupPeriodId?: number
  winner?: string
  home?: EspnScheduleSide
  away?: EspnScheduleSide
}

type EspnTransactionItem = {
  playerId?: number
  type?: string
  toTeamId?: number
  fromTeamId?: number
}

type EspnTransaction = {
  scoringPeriodId?: number
  status?: string
  type?: string
  items?: EspnTransactionItem[]
}

export type EspnWinnerStreamPayload = {
  status?: {
    currentScoringPeriod?: number
    currentMatchupPeriod?: number
  }
  settings?: {
    scheduleSettings?: {
      matchupPeriods?: Record<string, number[]>
    }
  }
  transactions?: EspnTransaction[]
  schedule?: EspnScheduleMatchup[]
}

type CacheEntry = {
  expiresAt: number
  recipes: WinnerStreamRecipe[]
}

const recipeCache = new Map<string, CacheEntry>()

export const resetWinnerStreamHistoryCache = () => {
  recipeCache.clear()
}

const espnHeaders = (cookies: EspnCookies): Record<string, string> => ({
  Accept: "application/json, text/plain, */*",
  Cookie: `espn_s2=${encodeURIComponent(cookies.espnS2)}; SWID=${cookies.swid}`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
})

const leagueUrl = (season: number, leagueId: string): URL =>
  new URL(
    `https://fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leagues/${leagueId}`,
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const outcomeFromEspn = (
  result: string | undefined,
): WinnerStreamTeamBox["outcomes"][CategoryId] | undefined => {
  const normalized = (result ?? "").toUpperCase()
  if (normalized === "WIN" || normalized === "W") return "W"
  if (normalized === "LOSS" || normalized === "L") return "L"
  if (normalized === "TIE" || normalized === "T") return "T"
  return undefined
}

const teamBoxFromSide = (side: EspnScheduleSide | undefined): WinnerStreamTeamBox | null => {
  const espnTeamId = asNumber(side?.teamId)
  if (espnTeamId == null || espnTeamId <= 0) return null

  const scoreByStat = side?.cumulativeScore?.scoreByStat ?? {}
  const outcomes: WinnerStreamTeamBox["outcomes"] = {}
  let countedWins = 0
  for (const [statId, row] of Object.entries(scoreByStat)) {
    const categoryId = ESPN_STAT_TO_CATEGORY[statId]
    if (!categoryId) continue
    const outcome = outcomeFromEspn(row?.result)
    if (!outcome) continue
    outcomes[categoryId] = outcome
    if (outcome === "W") countedWins += 1
  }

  return {
    espnTeamId,
    catWins: asNumber(side?.cumulativeScore?.wins) ?? countedWins,
    outcomes,
  }
}

const matchupPeriodsFromPayload = (
  payload: EspnWinnerStreamPayload,
): Map<number, number> => {
  const scoringToMatchup = new Map<number, number>()
  const raw = payload.settings?.scheduleSettings?.matchupPeriods ?? {}
  for (const [matchupId, days] of Object.entries(raw)) {
    const matchupPeriodId = Number(matchupId)
    if (!Number.isInteger(matchupPeriodId) || !Array.isArray(days)) continue
    for (const day of days) {
      if (typeof day === "number" && Number.isInteger(day)) {
        scoringToMatchup.set(day, matchupPeriodId)
      }
    }
  }
  return scoringToMatchup
}

const toMatchupPeriodId = (
  scoringPeriodId: number,
  scoringToMatchup: Map<number, number>,
): number => scoringToMatchup.get(scoringPeriodId) ?? scoringPeriodId

const isAddDropTransaction = (type: string | undefined): boolean => {
  const normalized = (type ?? "").toUpperCase()
  return normalized === "FREEAGENT" || normalized === "WAIVER"
}

const mapScheduleMatchup = (
  row: EspnScheduleMatchup,
  currentMatchupPeriod: number,
): WinnerStreamMatchupBox | null => {
  const scoringPeriodId = asNumber(row.matchupPeriodId)
  if (scoringPeriodId == null) return null
  const home = teamBoxFromSide(row.home)
  const away = teamBoxFromSide(row.away)
  if (!home || !away) return null
  const winner = (row.winner ?? "").toUpperCase()
  const complete =
    scoringPeriodId < currentMatchupPeriod && winner !== "UNDETERMINED"
  return { scoringPeriodId, complete, home, away }
}

const mapTransactions = (
  payload: EspnWinnerStreamPayload,
  scoringToMatchup: Map<number, number>,
): WinnerStreamAddEvent[] => {
  const events: WinnerStreamAddEvent[] = []
  for (const transaction of payload.transactions ?? []) {
    if ((transaction.status ?? "EXECUTED").toUpperCase() !== "EXECUTED") continue
    if (!isAddDropTransaction(transaction.type)) continue
    const scoringPeriodId = asNumber(transaction.scoringPeriodId)
    if (scoringPeriodId == null) continue
    const matchupPeriodId = toMatchupPeriodId(scoringPeriodId, scoringToMatchup)
    const items = transaction.items ?? []
    const dropsByTeam = new Map<number, number>()
    for (const item of items) {
      if ((item.type ?? "").toUpperCase() !== "DROP") continue
      const fromTeamId = asNumber(item.fromTeamId)
      const playerId = asNumber(item.playerId)
      if (fromTeamId == null || playerId == null) continue
      dropsByTeam.set(fromTeamId, playerId)
    }
    for (const item of items) {
      if ((item.type ?? "").toUpperCase() !== "ADD") continue
      const toTeamId = asNumber(item.toTeamId)
      const playerId = asNumber(item.playerId)
      if (toTeamId == null || toTeamId <= 0 || playerId == null) continue
      const droppedId = dropsByTeam.get(toTeamId)
      events.push({
        scoringPeriodId: matchupPeriodId,
        espnTeamId: toTeamId,
        addedPlayerId: String(playerId),
        ...(droppedId != null ? { droppedPlayerId: String(droppedId) } : {}),
      })
    }
  }
  return events
}

export const mapEspnWinnerStreamPayload = (
  payload: EspnWinnerStreamPayload,
  players: SeasonPlayer[],
  enabledCats: CategoryId[],
  currentMatchupPeriod?: number,
): WinnerStreamRecipe[] => {
  const scoringToMatchup = matchupPeriodsFromPayload(payload)
  const current =
    currentMatchupPeriod ??
    asNumber(payload.status?.currentMatchupPeriod) ??
    Number.POSITIVE_INFINITY
  const matchups = (payload.schedule ?? []).flatMap((row) => {
    const mapped = mapScheduleMatchup(row, current)
    return mapped ? [mapped] : []
  })
  return buildWinnerStreamRecipes({
    events: mapTransactions(payload, scoringToMatchup),
    matchups,
    players,
    enabledCats,
    currentScoringPeriodId: Number.isFinite(current) ? current : -1,
  })
}

const parseEspnJson = async (response: Response): Promise<unknown | null> => {
  const contentType = response.headers.get("content-type") ?? ""
  const bodyText = await response.text()
  if (
    !contentType.includes("application/json") ||
    bodyText.trimStart().startsWith("<")
  ) {
    return null
  }
  try {
    return JSON.parse(bodyText) as unknown
  } catch {
    return null
  }
}

const fetchEspnPayload = async (
  url: URL,
  cookies: EspnCookies,
): Promise<EspnWinnerStreamPayload | null> => {
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
      response.status === 308 ||
      response.status === 401 ||
      response.status === 403 ||
      !response.ok
    ) {
      return null
    }
    const parsed = await parseEspnJson(response)
    if (!isRecord(parsed)) return null
    return parsed as EspnWinnerStreamPayload
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const completedMatchupPeriodIds = (
  payload: EspnWinnerStreamPayload,
  currentMatchupPeriod: number,
): number[] => {
  const fromSettings = Object.keys(
    payload.settings?.scheduleSettings?.matchupPeriods ?? {},
  )
    .map((key) => Number(key))
    .filter((id) => Number.isInteger(id) && id < currentMatchupPeriod)
  if (fromSettings.length > 0) {
    return [...new Set(fromSettings)].sort((left, right) => left - right)
  }
  return Array.from({ length: Math.max(0, currentMatchupPeriod - 1) }, (_, index) => index + 1)
}

const lastScoringDay = (
  payload: EspnWinnerStreamPayload,
  matchupPeriodId: number,
): number => {
  const days = payload.settings?.scheduleSettings?.matchupPeriods?.[String(matchupPeriodId)]
  if (Array.isArray(days) && days.length > 0) {
    const numeric = days.filter((day) => typeof day === "number")
    if (numeric.length > 0) return Math.max(...numeric)
  }
  return matchupPeriodId
}

const mergePayloads = (
  base: EspnWinnerStreamPayload,
  extras: EspnWinnerStreamPayload[],
): EspnWinnerStreamPayload => {
  const schedule = [...(base.schedule ?? [])]
  const seen = new Set(
    schedule.map(
      (row) =>
        `${row.matchupPeriodId}:${row.home?.teamId}:${row.away?.teamId}`,
    ),
  )
  for (const extra of extras) {
    for (const row of extra.schedule ?? []) {
      const key = `${row.matchupPeriodId}:${row.home?.teamId}:${row.away?.teamId}`
      if (seen.has(key)) continue
      seen.add(key)
      schedule.push(row)
    }
  }
  return { ...base, schedule }
}

export const loadWinnerStreamRecipes = async (params: {
  leagueId: string
  season: number
  cookies: EspnCookies
  players: SeasonPlayer[]
  enabledCats: CategoryId[]
  currentMatchupPeriod?: number
}): Promise<WinnerStreamRecipe[]> => {
  const cacheKey = `${params.leagueId}:${params.season}`
  const cached = recipeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.recipes

  try {
    const indexUrl = leagueUrl(params.season, params.leagueId)
    indexUrl.searchParams.append("view", "mTransactions")
    indexUrl.searchParams.append("view", "mSettings")
    const indexPayload = await fetchEspnPayload(indexUrl, params.cookies)
    if (!indexPayload) return []

    const current =
      params.currentMatchupPeriod ??
      asNumber(indexPayload.status?.currentMatchupPeriod) ??
      1
    const periodIds = completedMatchupPeriodIds(indexPayload, current).slice(
      -MAX_SCOREBOARD_PERIODS,
    )
    const scoreboards = await Promise.all(
      periodIds.map((matchupPeriodId) => {
        const url = leagueUrl(params.season, params.leagueId)
        url.searchParams.set("view", "mScoreboard")
        url.searchParams.set(
          "scoringPeriodId",
          String(lastScoringDay(indexPayload, matchupPeriodId)),
        )
        return fetchEspnPayload(url, params.cookies)
      }),
    )
    const merged = mergePayloads(
      indexPayload,
      scoreboards.filter((row): row is EspnWinnerStreamPayload => row != null),
    )
    const recipes = mapEspnWinnerStreamPayload(
      merged,
      params.players,
      params.enabledCats,
      current,
    )
    recipeCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      recipes,
    })
    return recipes
  } catch {
    return []
  }
}
