import type { BreakoutPlayer } from "./breakout"
import { readBreakoutStatLines, type EspnStatRow } from "./breakoutStats"

const SIX_HOURS = 6 * 60 * 60 * 1000

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
    const stats = (player as { stats?: unknown }).stats
    const rows = Array.isArray(stats) ? stats.filter(isStatRow) : []
    return [{ id: String(rawId), ...readBreakoutStatLines(rows, seasonId) }]
  })
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
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${options.seasonId}/players?scoringPeriodId=0&view=kona_player_info`

  try {
    const response = await fetchImpl(url, {
      headers: {
        "x-fantasy-filter": JSON.stringify(fantasyFilter),
        Accept: "application/json",
      },
    })
    if (!response.ok) throw new Error("espn stat request failed")
    const players = playersFromPayload(await response.json(), options.seasonId)
    memory = { seasonId: options.seasonId, players, fetchedAt: nowMs }
    return { players, source: "espn" }
  } catch {
    if (memory && memory.seasonId === options.seasonId) {
      return { players: memory.players, source: "espn" }
    }
    return { players: [], source: "empty" }
  }
}
