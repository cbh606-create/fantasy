/**
 * Fetch ESPN Fantasy Basketball player pool and write a cached Player[] JSON.
 *
 * Usage:
 *   node scripts/refresh-players.mjs
 *   node scripts/refresh-players.mjs --season=2027 --limit=300 --out=data/players/proj_2026_27.json
 *
 * Fantasy season year 2027 ≈ NBA 2026-27.
 * Prefers ESPN projected season totals (10YYYY) over actuals (00YYYY).
 */

import { writeFile, mkdir } from "node:fs/promises"
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
const limit = Number(args.limit ?? 300)
const outRel =
  args.out ??
  (season === 2027
    ? "data/players/proj_2026_27.json"
    : season === 2026
      ? "data/players/stats_2025_26.json"
      : `data/players/stats_${season - 1}_${String(season).slice(2)}.json`)

const POSITION_BY_DEFAULT_ID = {
  1: "PG",
  2: "SG",
  3: "SF",
  4: "PF",
  5: "C",
}

const SLOT_TO_POSITION = {
  0: "PG",
  1: "SG",
  2: "SF",
  3: "PF",
  4: "C",
}

const EMPTY_PROJECTIONS = {
  FG_PCT: 0,
  FT_PCT: 0,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
}

const positionsFor = (player) => {
  const fromDefault = POSITION_BY_DEFAULT_ID[player.defaultPositionId]
  const fromSlots = (player.eligibleSlots || [])
    .map((slot) => SLOT_TO_POSITION[slot])
    .filter(Boolean)
  const unique = [...new Set([fromDefault, ...fromSlots].filter(Boolean))]
  return unique.length > 0 ? unique : ["SF"]
}

const resolveAdp = (espnPlayer, fallbackRank) => {
  const ownershipAdp = espnPlayer.ownership?.averageDraftPosition
  if (
    typeof ownershipAdp === "number" &&
    ownershipAdp > 0 &&
    ownershipAdp !== 140
  ) {
    return ownershipAdp
  }

  const standardRank = espnPlayer.draftRanksByRankType?.STANDARD?.rank
  if (typeof standardRank === "number" && standardRank > 0) {
    return standardRank
  }

  const owned = espnPlayer.ownership?.percentOwned
  if (typeof owned === "number" && owned > 0) {
    return 200 - owned
  }

  return fallbackRank
}

const isDraftRelevant = (espnPlayer) => {
  const ownershipAdp = espnPlayer.ownership?.averageDraftPosition
  const standardRank = espnPlayer.draftRanksByRankType?.STANDARD?.rank
  const owned = espnPlayer.ownership?.percentOwned ?? 0

  if (typeof standardRank === "number" && standardRank > 0 && standardRank <= 300) {
    return true
  }
  if (
    typeof ownershipAdp === "number" &&
    ownershipAdp > 0 &&
    ownershipAdp !== 140 &&
    ownershipAdp <= 250
  ) {
    return true
  }
  if (owned >= 5) return true

  return false
}

const projectionsFromStats = (s) => {
  if (!s) return { ...EMPTY_PROJECTIONS }
  return {
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
  }
}

const toPlayer = (espnPlayer, seasonId, fallbackRank) => {
  const seasonStats = pickBestStats(espnPlayer, seasonId)
  const draftRelevant = isDraftRelevant(espnPlayer)

  if (!seasonStats && !draftRelevant) return null

  const s = seasonStats?.stats
  const projectedGames = s ? num(s, STAT.GP, null) : null

  const status =
    espnPlayer.injuryStatus === "OUT"
      ? "out"
      : espnPlayer.injuryStatus === "DAY_TO_DAY" ||
          espnPlayer.injuryStatus === "GTD"
        ? "gtd"
        : "active"

  return {
    id: `espn-${espnPlayer.id}`,
    name: espnPlayer.fullName || `${espnPlayer.firstName} ${espnPlayer.lastName}`,
    positions: positionsFor(espnPlayer),
    projections: projectionsFromStats(s),
    ...(typeof projectedGames === "number" && projectedGames > 0
      ? { projectedGames }
      : {}),
    adp: Number(resolveAdp(espnPlayer, fallbackRank)),
    espnId: String(espnPlayer.id),
    status,
    percentOwned: espnPlayer.ownership?.percentOwned ?? 0,
    statsSeasonId: seasonStats?.seasonId ?? null,
    statsKind: seasonStats?.kind ?? null,
    statsRowId: seasonStats?.id ?? null,
  }
}

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
  console.log(`Fetching ESPN FBA players for season ${season} (top ${limit})…`)
  const espnPlayers = await fetchEspnPlayers(season)

  espnPlayers.sort((a, b) => {
    const adpA = resolveAdp(a, 999)
    const adpB = resolveAdp(b, 999)
    if (adpA !== adpB) return adpA - adpB
    return (b.ownership?.percentOwned ?? 0) - (a.ownership?.percentOwned ?? 0)
  })

  const players = []
  const kindCounts = { projection: 0, actual: 0, none: 0 }
  for (const [index, espnPlayer] of espnPlayers.entries()) {
    const mapped = toPlayer(espnPlayer, season, index + 1)
    if (!mapped) continue
    if (mapped.statsKind === "projection") kindCounts.projection += 1
    else if (mapped.statsKind === "actual") kindCounts.actual += 1
    else kindCounts.none += 1
    players.push(mapped)
    if (players.length >= limit) break
  }

  players.sort((a, b) => a.adp - b.adp)
  players.forEach((player) => {
    delete player.percentOwned
  })

  const outPath = path.resolve(process.cwd(), outRel)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(
    outPath,
    `${JSON.stringify(
      {
        meta: {
          source: "espn_fantasy_kona_player_info",
          fantasySeason: season,
          nbaSeasonLabel: `${season - 1}-${String(season).slice(2)}`,
          generatedAt: new Date().toISOString(),
          count: players.length,
          adpSource: "espn_ownership_or_draft_rank",
          statsPreference: "projection_over_actual",
          statsKindCounts: kindCounts,
        },
        players,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  console.log(`Wrote ${players.length} players → ${outPath}`)
  console.log(`Stats kinds:`, kindCounts)
  console.log(
    `Sample: ${players
      .slice(0, 8)
      .map(
        (player) =>
          `${player.name}(${player.statsKind}:${player.statsRowId},PTS=${player.projections.PTS},GP=${player.projectedGames ?? "—"})`,
      )
      .join(" | ")}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
