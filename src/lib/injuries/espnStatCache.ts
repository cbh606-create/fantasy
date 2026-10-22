import { proTeamAbbr } from "@/lib/adapters/espnSeasonMap"
import type { BreakoutPlayer, PriorRole } from "./breakout"
import { readBreakoutStatLines, type EspnStatRow } from "./breakoutStats"

const SIX_HOURS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

const fantasyFilter = {
  players: {
    filterSlotIds: { value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    limit: 2000,
    offset: 0,
    sortPercOwned: { sortPriority: 1, sortAsc: false },
    filterStatsForSourceIds: { value: [0, 1] },
    useFullProjectionTable: { value: true },
  },
}

type Snapshot = {
  seasonId: number
  players: BreakoutPlayer[]
  fetchedAt: number
}

let memory: Snapshot | null = null

export const clearEspnStatCache = (): void => {
  memory = null
}

const isStatRow = (value: unknown): value is EspnStatRow =>
  typeof value === "object" && value !== null

const playersFromPayload = (payload: unknown, seasonId: number): BreakoutPlayer[] => {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((player) => {
    if (!isStatRow(player)) return []
    const rawId = (player as { id?: unknown }).id
    if (typeof rawId !== "string" && typeof rawId !== "number") return []
    const rawTeam = (player as { proTeamId?: unknown }).proTeamId
    const stats = (player as { stats?: unknown }).stats
    const rows = Array.isArray(stats) ? stats.filter(isStatRow) : []
    return [{
      id: String(rawId),
      teamAbbr: typeof rawTeam === "number" ? proTeamAbbr(rawTeam) : null,
      prior: null,
      ...readBreakoutStatLines(rows, seasonId),
    }]
  })
}

const priorRole = (player: BreakoutPlayer | undefined): PriorRole | null => {
  if (!player || (!player.teamAbbr && !player.season)) return null
  return { teamAbbr: player.teamAbbr ?? null, line: player.season }
}

const seasonUrl = (seasonId: number) =>
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${seasonId}/players?scoringPeriodId=0&view=kona_player_info`

const fetchSeasonPlayers = async (
  seasonId: number,
  fetchImpl: typeof fetch,
): Promise<BreakoutPlayer[] | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(seasonUrl(seasonId), {
      headers: {
        "x-fantasy-filter": JSON.stringify(fantasyFilter),
        Accept: "application/json",
      },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return playersFromPayload(await response.json(), seasonId)
  } finally {
    clearTimeout(timeout)
  }
}

export const loadEspnBreakoutPlayers = async (options: {
  seasonId: number
  now: Date
  fetchImpl?: typeof fetch
}): Promise<{ players: BreakoutPlayer[]; source: "espn" | "empty" }> => {
  const nowMs = options.now.getTime()
  const fresh =
    memory !== null &&
    memory.seasonId === options.seasonId &&
    nowMs - memory.fetchedAt < SIX_HOURS
  if (fresh && memory) return { players: memory.players, source: "espn" }

  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const current = await fetchSeasonPlayers(options.seasonId, fetchImpl)
    if (!current) throw new Error("espn stat request failed")
    let priorPlayers: BreakoutPlayer[] | null = null
    try {
      priorPlayers = await fetchSeasonPlayers(options.seasonId - 1, fetchImpl)
    } catch {
      priorPlayers = null
    }
    const priorById = new Map((priorPlayers ?? []).map((player) => [player.id, player]))
    const players = current.map((player) => ({
      ...player,
      prior: priorRole(priorById.get(player.id)),
    }))
    memory = { seasonId: options.seasonId, players, fetchedAt: nowMs }
    return { players, source: "espn" }
  } catch {
    if (memory && memory.seasonId === options.seasonId) {
      return { players: memory.players, source: "espn" }
    }
    return { players: [], source: "empty" }
  }
}
