import { readFile } from "node:fs/promises"
import path from "node:path"
import type { CategoryId } from "@/lib/domain/types"
import {
  buildStatPairRows,
  observationsForStatPairs,
  type StatPairRow,
  type StatPairShooting,
} from "@/lib/players/statPairCorrelation"

const LAST_SEASON_STATS_PATH = path.resolve(
  process.cwd(),
  "data/players/stats_2025_26.json",
)

type LastSeasonFilePlayer = {
  projectedGames?: number
  projections?: Record<CategoryId, number>
  shooting?: StatPairShooting
}

type LastSeasonPlayerWithProjections = Omit<
  LastSeasonFilePlayer,
  "projections"
> & {
  projections: Record<CategoryId, number>
}

type CurrentStatPairPlayer = {
  seasonRates?: {
    gamesPlayed: number
    projections: Record<CategoryId, number>
    shooting: StatPairShooting
  }
  projections?: Record<CategoryId, number>
}

const readLastSeasonPlayers = async (): Promise<
  LastSeasonPlayerWithProjections[]
> => {
  try {
    const parsed = JSON.parse(
      await readFile(LAST_SEASON_STATS_PATH, "utf8"),
    ) as { players?: LastSeasonFilePlayer[] }
    if (!Array.isArray(parsed.players)) return []
    return parsed.players.flatMap((player) => {
      if (!player?.projections) return []
      return [{
        projectedGames: player.projectedGames,
        projections: player.projections,
        ...(player.shooting ? { shooting: player.shooting } : {}),
      }]
    })
  } catch {
    return []
  }
}

export const loadStatPairs = async (
  currentPlayers: CurrentStatPairPlayer[],
): Promise<StatPairRow[]> =>
  buildStatPairRows(
    observationsForStatPairs({
      lastSeason: await readLastSeasonPlayers(),
      currentSeason: currentPlayers,
    }),
  )
