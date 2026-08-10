/**
 * Fetch ESPN Fantasy Basketball player pool and write a cached Player[] JSON.
 *
 * Usage:
 *   node scripts/refresh-players.mjs
 *   node scripts/refresh-players.mjs --season=2026 --limit=250 --out=data/players/stats_2025_26.json
 *
 * Fantasy season year 2026 ≈ NBA 2025-26.
 */

import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const season = Number(args.season ?? 2026)
const limit = Number(args.limit ?? 250)
const outRel =
  args.out ??
  (season === 2026
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
  FG_PCT: "19",
  FT_PCT: "20",
}

const num = (stats, key, fallback = 0) => {
  const value = stats?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

const pickSeasonStats = (player, seasonId) => {
  const stats = Array.isArray(player.stats) ? player.stats : []
  const preferredIds = [
    `00${seasonId}`,
    `01${seasonId}`,
    `02${seasonId}`,
    `10${seasonId}`,
  ]

  for (const id of preferredIds) {
    const match = stats.find((entry) => entry.id === id && entry.stats)
    if (match) return { id, stats: match.stats }
  }

  const seasonEntries = stats.filter(
    (entry) =>
      entry.seasonId === seasonId &&
      entry.stats &&
      (entry.statSplitTypeId === 0 || entry.statSplitTypeId === 1),
  )
  seasonEntries.sort((a, b) => {
    const score = (entry) =>
      (entry.statSourceId === 0 ? 0 : 10) + (entry.statSplitTypeId ?? 99)
    return score(a) - score(b)
  })
  if (seasonEntries[0]) {
    return { id: seasonEntries[0].id, stats: seasonEntries[0].stats }
  }

  return null
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
  const standardRank = espnPlayer.draftRanksByRankType?.STANDARD?.rank
  if (typeof standardRank === "number" && standardRank > 0) {
    return standardRank
  }

  const ownershipAdp = espnPlayer.ownership?.averageDraftPosition
  // ESPN often parks unranked ADP at 140; treat that as missing.
  if (
    typeof ownershipAdp === "number" &&
    ownershipAdp > 0 &&
    ownershipAdp !== 140
  ) {
    return ownershipAdp
  }

  return fallbackRank
}

const toPlayer = (espnPlayer, seasonId, fallbackRank) => {
  const seasonStats = pickSeasonStats(espnPlayer, seasonId)
  if (!seasonStats) return null

  const s = seasonStats.stats
  const fgPct = num(s, STAT.FG_PCT, null)
  const ftPct = num(s, STAT.FT_PCT, null)
  const fgm = num(s, STAT.FGM)
  const fga = num(s, STAT.FGA)
  const ftm = num(s, STAT.FTM)
  const fta = num(s, STAT.FTA)

  const projections = {
    FG_PCT: fgPct ?? (fga > 0 ? fgm / fga : 0),
    FT_PCT: ftPct ?? (fta > 0 ? ftm / fta : 0),
    TPM: num(s, STAT.TPM),
    REB: num(s, STAT.REB),
    AST: num(s, STAT.AST),
    STL: num(s, STAT.STL),
    BLK: num(s, STAT.BLK),
    TO: num(s, STAT.TO),
    PTS: num(s, STAT.PTS),
  }

  if (
    projections.PTS === 0 &&
    projections.REB === 0 &&
    projections.AST === 0 &&
    projections.TPM === 0
  ) {
    return null
  }

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
    projections,
    adp: Number(resolveAdp(espnPlayer, fallbackRank)),
    espnId: String(espnPlayer.id),
    status,
    percentOwned: espnPlayer.ownership?.percentOwned ?? 0,
  }
}

const fetchEspnPlayers = async (seasonId) => {
  const fantasyFilter = {
    players: {
      filterSlotIds: { value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      limit: 2000,
      offset: 0,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
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

  espnPlayers.sort(
    (a, b) =>
      (b.ownership?.percentOwned ?? 0) - (a.ownership?.percentOwned ?? 0),
  )

  const players = []
  for (const [index, espnPlayer] of espnPlayers.entries()) {
    const mapped = toPlayer(espnPlayer, season, index + 1)
    if (!mapped) continue
    players.push(mapped)
    if (players.length >= limit) break
  }

  // Prefer ownership order for draft sim; keep ADP as rank when available.
  players.sort((a, b) => {
    const ownedDiff = (b.percentOwned ?? 0) - (a.percentOwned ?? 0)
    if (ownedDiff !== 0) return ownedDiff
    return a.adp - b.adp
  })
  players.forEach((player, index) => {
    player.adp = index + 1
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
        },
        players,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  console.log(`Wrote ${players.length} players → ${outPath}`)
  console.log(
    `Sample: ${players
      .slice(0, 5)
      .map((player) => `${player.adp}. ${player.name}`)
      .join(" | ")}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
