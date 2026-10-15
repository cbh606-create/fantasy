import { buildCrosswalk, type CrosswalkEspnPlayer } from "./crosswalk"
import {
  parseConfirmedLineups,
  parseDepthChart,
  parseInjuryUpdates,
  parseRotoPlayers,
} from "./rotowireParse"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"
import { parseTradeNews, type TradeNewsItem } from "./tradeNews"

export type CachedInjuryInputs = {
  updates: InjuryUpdate[]
  depth: DepthChart
  lineups: ConfirmedLineup[]
  crosswalk: Map<string, string>
  news: TradeNewsItem[]
}

const EMPTY_INPUTS = (): CachedInjuryInputs => ({
  updates: [],
  depth: { teams: [] },
  lineups: [],
  crosswalk: new Map(),
  news: [],
})

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000
const SIXTY_MINUTES = 60 * 60 * 1000
const SIX_HOURS = 6 * 60 * 60 * 1000
const TWO_HOURS = 2 * 60 * 60 * 1000

type Stamp<T> = { value: T; fetchedAt: number }

type LineupCache = {
  lineups: ConfirmedLineup[]
  gameStartTimes: string[]
}

type Memory = {
  updates: Stamp<InjuryUpdate[]>
  depth: Stamp<DepthChart>
  lineups: Stamp<LineupCache>
  players: Stamp<ReturnType<typeof parseRotoPlayers>>
  news: Stamp<TradeNewsItem[]>
}

const emptyLineupCache = (): LineupCache => ({ lineups: [], gameStartTimes: [] })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const parseableStartTime = (raw: string): string | null => {
  const startsAt = raw.trim()
  if (startsAt.length === 0) return null
  const parsed = new Date(startsAt)
  if (Number.isNaN(parsed.getTime())) return null
  return startsAt
}

const parseGameStartTimes = (payload: unknown): string[] => {
  if (!isRecord(payload)) return []

  const games = payload.Games
  if (!Array.isArray(games)) return []

  return games.flatMap((game) => {
    if (!isRecord(game)) return []
    const startsAt = typeof game.DateTime === "string" ? parseableStartTime(game.DateTime) : null
    return startsAt !== null ? [startsAt] : []
  })
}

let memory: Memory | null = null

export const clearInjurySelectionCache = (): void => {
  memory = null
}

const easternCalendarDate = (date: Date): string | null => {
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date)
}

const sameEasternDate = (left: Date, right: Date): boolean => {
  const leftDay = easternCalendarDate(left)
  const rightDay = easternCalendarDate(right)
  if (leftDay === null || rightDay === null) return false
  return leftDay === rightDay
}

const stale = (stamp: Stamp<unknown> | undefined, now: number, ttl: number): boolean =>
  !stamp || now - stamp.fetchedAt >= ttl

const endpoint = (path: string, key: string, hours?: number): string => {
  const url = new URL(path, "https://api.rotowire.com")
  url.searchParams.set("key", key)
  url.searchParams.set("format", "json")
  if (hours !== undefined) url.searchParams.set("hours", String(hours))
  return url.toString()
}

const readJson = async (fetchImpl: typeof fetch, url: string): Promise<unknown> => {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`RotoWire ${response.status}`)
  return response.json()
}

export const loadInjurySelectionInputs = async (options: {
  now: Date
  espnPlayers: CrosswalkEspnPlayer[]
  fetchImpl?: typeof fetch
}): Promise<CachedInjuryInputs> => {
  const key = process.env.ROTOWIRE_API_KEY?.trim() ?? ""
  if (key.length === 0) return memory ? snapshot(memory, options.espnPlayers) : EMPTY_INPUTS()

  const fetchImpl = options.fetchImpl ?? fetch
  const nowMs = options.now.getTime()
  const cachedTips = memory?.lineups.value.gameStartTimes ?? []
  const gameDay =
    memory !== null &&
    cachedTips.some((startsAt) => {
      const tipAt = new Date(startsAt)
      if (Number.isNaN(tipAt.getTime())) return false
      return sameEasternDate(tipAt, options.now)
    })
  const nextTip = cachedTips
    .map((startsAt) => new Date(startsAt).getTime())
    .filter((startsAt) => !Number.isNaN(startsAt) && startsAt > nowMs)
    .sort((left, right) => left - right)[0]
  const nextTipDate = nextTip !== undefined ? new Date(nextTip) : null
  const lineupTtl =
    nextTip !== undefined &&
    (nextTip - nowMs <= TWO_HOURS ||
      (nextTipDate !== null &&
        !Number.isNaN(nextTipDate.getTime()) &&
        sameEasternDate(nextTipDate, options.now)))
      ? FIVE_MINUTES
      : SIX_HOURS

  const next: Memory = {
    updates: memory?.updates ?? { value: [], fetchedAt: 0 },
    depth: memory?.depth ?? { value: { teams: [] }, fetchedAt: 0 },
    lineups: memory?.lineups ?? { value: emptyLineupCache(), fetchedAt: 0 },
    players: memory?.players ?? { value: [], fetchedAt: 0 },
    news: memory?.news ?? { value: [], fetchedAt: 0 },
  }

  if (stale(memory?.updates, nowMs, gameDay ? FIVE_MINUTES : THIRTY_MINUTES)) {
    try {
      next.updates = {
        value: parseInjuryUpdates(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-injuries.php", key, 24)),
        ),
        fetchedAt: nowMs,
      }
    } catch {
      // keep previous stamp for this input
    }
    try {
      next.news = {
        value: parseTradeNews(
          await readJson(
            fetchImpl,
            endpoint("/Basketball/get-nba-news.php", key, 24) + "&with_analysis=0",
          ),
        ),
        fetchedAt: nowMs,
      }
    } catch {
      // keep previous stamp for this input
    }
  }
  if (stale(memory?.depth, nowMs, gameDay ? SIXTY_MINUTES : SIX_HOURS)) {
    try {
      next.depth = {
        value: parseDepthChart(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-depth-charts.php", key)),
        ),
        fetchedAt: nowMs,
      }
    } catch {
      // keep previous stamp for this input
    }
  }
  if (stale(memory?.lineups, nowMs, lineupTtl)) {
    try {
      const payload = await readJson(
        fetchImpl,
        endpoint("/Basketball/get-nba-lineups.php", key),
      )
      next.lineups = {
        value: {
          lineups: parseConfirmedLineups(payload),
          gameStartTimes: parseGameStartTimes(payload),
        },
        fetchedAt: nowMs,
      }
    } catch {
      // keep previous stamp for this input
    }
  }
  if (stale(memory?.players, nowMs, SIX_HOURS)) {
    try {
      next.players = {
        value: parseRotoPlayers(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-players.php", key)),
        ),
        fetchedAt: nowMs,
      }
    } catch {
      // keep previous stamp for this input
    }
  }

  memory = next
  return snapshot(next, options.espnPlayers)
}

const snapshot = (cached: Memory, espnPlayers: CrosswalkEspnPlayer[]): CachedInjuryInputs => ({
  updates: cached.updates.value,
  depth: cached.depth.value,
  lineups: cached.lineups.value.lineups,
  crosswalk: buildCrosswalk(espnPlayers, cached.players.value),
  news: cached.news.value,
})
