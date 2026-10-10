import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  actualGamesPlayed,
  mergeActualGamesPlayed,
  type ActualStatRow,
} from "../src/lib/players/mergeActualGamesPlayed"

const STATS_PATH = "data/players/stats_2025_26.json"
const FANTASY_SEASON = 2026

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

type EspnPlayer = {
  id?: string | number
  stats?: ActualStatRow[]
}

type StatsFile = {
  meta: Record<string, unknown>
  players: Array<{
    name?: string
    espnId?: string
    projections: { PTS?: number }
    projectedGames?: number
  }>
}

const fetchEspnPlayers = async (): Promise<EspnPlayer[]> => {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${FANTASY_SEASON}/players?scoringPeriodId=0&view=kona_player_info`
  const response = await fetch(url, {
    headers: {
      "x-fantasy-filter": JSON.stringify(fantasyFilter),
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`ESPN players request failed: HTTP ${response.status}`)
  }

  const payload = (await response.json()) as EspnPlayer[] | { players?: EspnPlayer[] }
  return Array.isArray(payload) ? payload : payload.players || []
}

const main = async () => {
  const filePath = path.resolve(process.cwd(), STATS_PATH)
  const file = JSON.parse(await readFile(filePath, "utf8")) as StatsFile
  const espnPlayers = await fetchEspnPlayers()

  const gamesByEspnId: Record<string, number> = {}
  for (const player of espnPlayers) {
    if (player.id == null) continue
    const games = actualGamesPlayed(player.stats ?? [], FANTASY_SEASON)
    if (games == null) continue
    gamesByEspnId[String(player.id)] = games
  }

  const players = mergeActualGamesPlayed(file.players, gamesByEspnId)
  const projectedGamesUpdated = players.filter(
    (player) => typeof player.projectedGames === "number",
  ).length

  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        meta: {
          ...file.meta,
          projectedGamesSource: "espn_actual_stat_42",
          projectedGamesUpdated,
        },
        players,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  console.log(`projectedGamesUpdated ${projectedGamesUpdated}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
