/**
 * Overlay ESPN projected season stats onto an existing player pool.
 * Preserves ADP, identity, and pool meta (unlike a full players:refresh).
 *
 * Usage:
 *   node scripts/refresh-espn-projections.mjs
 *   node scripts/refresh-espn-projections.mjs --in=data/players/proj_2026_27.json --season=2027
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  STAT,
  num,
  pickBestStats,
} from "./lib/espn-season-stats.mjs"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const season = Number(args.season ?? 2027)
const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel

const projectionsFromStats = (s) => ({
  FG_PCT:
    num(s, STAT.FG_PCT, null) ??
    (num(s, STAT.FGA) > 0 ? num(s, STAT.FGM) / num(s, STAT.FGA) : 0),
  FT_PCT:
    num(s, STAT.FT_PCT, null) ??
    (num(s, STAT.FTA) > 0 ? num(s, STAT.FTM) / num(s, STAT.FTA) : 0),
  TPM: num(s, STAT.TPM),
  REB: num(s, STAT.REB),
  AST: num(s, STAT.AST),
  STL: num(s, STAT.STL),
  BLK: num(s, STAT.BLK),
  TO: num(s, STAT.TO),
  PTS: num(s, STAT.PTS),
})

const fetchEspnPlayers = async (seasonId) => {
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
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${seasonId}/players?scoringPeriodId=0&view=kona_player_info`
  const response = await fetch(url, {
    headers: {
      "x-fantasy-filter": JSON.stringify(fantasyFilter),
      Accept: "application/json",
    },
  })
  if (!response.ok) {
    throw new Error(`ESPN players request failed: HTTP ${response.status}`)
  }
  const payload = await response.json()
  return Array.isArray(payload) ? payload : payload.players || []
}

const main = async () => {
  const inPath = path.resolve(process.cwd(), inRel)
  const outPath = path.resolve(process.cwd(), outRel)
  const pool = JSON.parse(await readFile(inPath, "utf8"))
  if (!Array.isArray(pool.players)) {
    throw new Error(`Expected players[] in ${inRel}`)
  }

  console.log(`Fetching ESPN players for fantasy season ${season}…`)
  const espnPlayers = await fetchEspnPlayers(season)
  const byEspnId = new Map()
  for (const row of espnPlayers) {
    const espnPlayer = row.player || row
    byEspnId.set(String(espnPlayer.id), espnPlayer)
  }

  const kindCounts = { projection: 0, actual: 0, missing: 0 }
  let updated = 0

  pool.players = pool.players.map((player) => {
    const espnId =
      player.espnId ??
      (typeof player.id === "string" && player.id.startsWith("espn-")
        ? player.id.slice(5)
        : null)
    if (!espnId) {
      kindCounts.missing += 1
      return player
    }

    const espnPlayer = byEspnId.get(String(espnId))
    if (!espnPlayer) {
      kindCounts.missing += 1
      return player
    }

    const pick = pickBestStats(espnPlayer, season)
    if (!pick?.stats) {
      kindCounts.missing += 1
      return player
    }

    if (pick.kind === "projection") kindCounts.projection += 1
    else kindCounts.actual += 1

    const projectedGames = num(pick.stats, STAT.GP, null)
    updated += 1
    const next = {
      ...player,
      projections: projectionsFromStats(pick.stats),
      statsSeasonId: pick.seasonId ?? null,
      statsKind: pick.kind,
      statsRowId: pick.id,
    }
    if (typeof projectedGames === "number" && projectedGames > 0) {
      next.projectedGames = projectedGames
    } else {
      delete next.projectedGames
    }
    return next
  })

  pool.meta = {
    ...pool.meta,
    projectionOverlay: "espn",
    espnProjectionsUpdatedAt: new Date().toISOString(),
    statsPreference: "projection_over_actual",
    statsKindCounts: kindCounts,
    espnProjectionsUpdated: updated,
  }

  await writeFile(outPath, `${JSON.stringify(pool, null, 2)}\n`, "utf8")

  const sample = pool.players.slice(0, 5).map((player) => ({
    name: player.name,
    kind: player.statsKind,
    row: player.statsRowId,
    PTS: player.projections.PTS,
    GP: player.projectedGames,
  }))
  console.log({ updated, kindCounts, sample })
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
