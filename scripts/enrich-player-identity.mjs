/**
 * Enrich player pool with ESPN headshot URLs and team abbreviations.
 *
 * Usage:
 *   node scripts/enrich-player-identity.mjs
 *   node scripts/enrich-player-identity.mjs --in=data/players/proj_2026_27.json --season=2027
 *
 * Preserves all existing fields including adpBySource.
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const season = Number(args.season ?? 2027)
const inRel = args.in ?? "data/players/proj_2026_27.json"

const PRO_TEAM_ABBR = {
  1: "ATL",
  2: "BOS",
  3: "NOP",
  4: "CHI",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GSW",
  10: "HOU",
  11: "IND",
  12: "LAC",
  13: "LAL",
  14: "MIA",
  15: "MIL",
  16: "MIN",
  17: "BKN",
  18: "NYK",
  19: "ORL",
  20: "PHI",
  21: "PHX",
  22: "POR",
  23: "SAC",
  24: "SAS",
  25: "OKC",
  26: "UTA",
  27: "WAS",
  28: "TOR",
  29: "MEM",
  30: "CHA",
}

const headshotUrl = (espnId) =>
  `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`

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
  const inPath = path.resolve(process.cwd(), inRel)
  console.log(`Reading ${inPath}…`)
  const raw = JSON.parse(await readFile(inPath, "utf8"))
  const players = Array.isArray(raw.players) ? raw.players : []

  console.log(`Fetching ESPN FBA players for season ${season}…`)
  const espnPlayers = await fetchEspnPlayers(season)
  const teamByEspnId = new Map()
  for (const espnPlayer of espnPlayers) {
    if (espnPlayer?.id == null) continue
    const abbr = PRO_TEAM_ABBR[espnPlayer.proTeamId ?? -1]
    if (abbr) {
      teamByEspnId.set(String(espnPlayer.id), abbr)
    }
  }
  console.log(`ESPN roster map: ${teamByEspnId.size} players with known team`)

  let imageCount = 0
  let teamCount = 0

  const enriched = players.map((player) => {
    const next = { ...player }

    if (player.espnId) {
      next.imageUrl = headshotUrl(player.espnId)
      imageCount += 1
      const teamAbbr = teamByEspnId.get(String(player.espnId))
      if (teamAbbr) {
        next.teamAbbr = teamAbbr
        teamCount += 1
      }
    }

    return next
  })

  const out = {
    ...raw,
    players: enriched,
  }

  await writeFile(inPath, `${JSON.stringify(out, null, 2)}\n`, "utf8")

  console.log(`Wrote ${enriched.length} players → ${inPath}`)
  console.log(`imageUrl set: ${imageCount}`)
  console.log(`teamAbbr set: ${teamCount}`)

  const wemby = enriched.find((p) => p.name === "Victor Wembanyama")
  if (wemby) {
    console.log(
      `Wembanyama: teamAbbr=${wemby.teamAbbr ?? "MISSING"} imageUrl=${wemby.imageUrl ?? "MISSING"}`,
    )
  } else {
    console.log("Wembanyama: MISSING from pool")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
