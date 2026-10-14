import { buildCrosswalk, type CrosswalkEspnPlayer } from "./crosswalk"
import {
  parseConfirmedLineups,
  parseDepthChart,
  parseInjuryUpdates,
  parseRotoPlayers,
} from "./rotowireParse"
import type { ConfirmedLineup, DepthChart, InjuryUpdate } from "./selection"

export type CachedInjuryInputs = {
  updates: InjuryUpdate[]
  depth: DepthChart
  lineups: ConfirmedLineup[]
  crosswalk: Map<string, string>
}

const EMPTY_INPUTS = (): CachedInjuryInputs => ({
  updates: [],
  depth: { teams: [] },
  lineups: [],
  crosswalk: new Map(),
})

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000
const SIXTY_MINUTES = 60 * 60 * 1000
const SIX_HOURS = 6 * 60 * 60 * 1000
const TWO_HOURS = 2 * 60 * 60 * 1000

type Stamp<T> = { value: T; fetchedAt: number }

type Memory = {
  updates: Stamp<InjuryUpdate[]>
  depth: Stamp<DepthChart>
  lineups: Stamp<ConfirmedLineup[]>
  players: Stamp<ReturnType<typeof parseRotoPlayers>>
}

let memory: Memory | null = null

export const clearInjurySelectionCache = (): void => {
  memory = null
}

const sameUtcDate = (left: Date, right: Date): boolean =>
  left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10)

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
  const gameDay =
    memory?.lineups.value.some((lineup) =>
      sameUtcDate(new Date(lineup.startsAt), options.now),
    ) ?? false
  const nextTip = memory?.lineups.value
    .map((lineup) => new Date(lineup.startsAt).getTime())
    .filter((startsAt) => !Number.isNaN(startsAt) && startsAt > nowMs)
    .sort((left, right) => left - right)[0]
  const lineupTtl =
    nextTip !== undefined && nextTip - nowMs <= TWO_HOURS ? FIVE_MINUTES : SIX_HOURS

  try {
    const next: Memory = {
      updates: memory?.updates ?? { value: [], fetchedAt: 0 },
      depth: memory?.depth ?? { value: { teams: [] }, fetchedAt: 0 },
      lineups: memory?.lineups ?? { value: [], fetchedAt: 0 },
      players: memory?.players ?? { value: [], fetchedAt: 0 },
    }

    if (stale(memory?.updates, nowMs, gameDay ? FIVE_MINUTES : THIRTY_MINUTES)) {
      next.updates = {
        value: parseInjuryUpdates(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-injuries.php", key, 24)),
        ),
        fetchedAt: nowMs,
      }
    }
    if (stale(memory?.depth, nowMs, gameDay ? SIXTY_MINUTES : SIX_HOURS)) {
      next.depth = {
        value: parseDepthChart(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-depth-charts.php", key)),
        ),
        fetchedAt: nowMs,
      }
    }
    if (stale(memory?.lineups, nowMs, lineupTtl)) {
      next.lineups = {
        value: parseConfirmedLineups(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-lineups.php", key)),
        ),
        fetchedAt: nowMs,
      }
    }
    if (stale(memory?.players, nowMs, SIX_HOURS)) {
      next.players = {
        value: parseRotoPlayers(
          await readJson(fetchImpl, endpoint("/Basketball/get-nba-players.php", key)),
        ),
        fetchedAt: nowMs,
      }
    }

    memory = next
    return snapshot(next, options.espnPlayers)
  } catch {
    return memory ? snapshot(memory, options.espnPlayers) : EMPTY_INPUTS()
  }
}

const snapshot = (cached: Memory, espnPlayers: CrosswalkEspnPlayer[]): CachedInjuryInputs => ({
  updates: cached.updates.value,
  depth: cached.depth.value,
  lineups: cached.lineups.value,
  crosswalk: buildCrosswalk(espnPlayers, cached.players.value),
})
