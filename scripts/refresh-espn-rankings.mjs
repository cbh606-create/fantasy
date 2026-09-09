/**
 * Overlay ESPN Fantasy averageDraftPosition onto the player pool.
 *
 * Live: lm-api-reads kona_player_info ownership.averageDraftPosition.
 * Fixture fallback when live fetch fails or --fixture is set.
 *
 * Usage:
 *   node scripts/refresh-espn-rankings.mjs
 *   node scripts/refresh-espn-rankings.mjs --fixture
 *   node scripts/refresh-espn-rankings.mjs --write-fixture
 *   node scripts/refresh-espn-rankings.mjs --primary=espn
 *   node scripts/refresh-espn-rankings.mjs --season=2027
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applySourceRanks,
  normalizeName,
  projectPrimary,
} from "./lib/adp-pool.mjs"

const SOURCE_ID = "espn_article_h2h_points"
const FIXTURE_REL = "data/players/espn_adp_2026_27.json"
const LEGACY_ARTICLE_FIXTURE =
  "data/players/espn_h2h_points_rankings_2026_27.json"
const USER_AGENT =
  "fantasy-draft-tool/0.1 (local ESPN ADP refresh; +https://github.com/cbh606-create/fantasy)"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel
const fixtureRel = args.ranks ?? FIXTURE_REL
const forceFixture =
  args.fixture === "true" ||
  (typeof args.fixture === "string" && args.fixture !== "true")
const writeFixture = args["write-fixture"] === "true"
const primaryEspn = args.primary === "espn"
const seasonId = Number.parseInt(args.season ?? "2027", 10)
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)
const fixturePath = path.resolve(process.cwd(), fixtureRel)

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

const fetchEspnAdpLive = async () => {
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
      "user-agent": USER_AGENT,
      accept: "application/json",
      "x-fantasy-filter": JSON.stringify(fantasyFilter),
    },
  })
  if (!response.ok) {
    throw new Error(`ESPN ADP fetch failed: HTTP ${response.status}`)
  }

  const payload = await response.json()
  const players = Array.isArray(payload) ? payload : payload.players || []
  const rows = []
  for (const player of players) {
    const name = player?.fullName
    const adp = Number(player?.ownership?.averageDraftPosition)
    if (!name || !Number.isFinite(adp) || adp <= 0) continue
    // Undrafted / filler ADP clusters around the late pool — skip obvious dumps.
    if (adp >= 140 && (player?.ownership?.percentOwned ?? 0) < 1) continue
    rows.push({
      name,
      adp,
      key: normalizeName(name),
      espnId: player.id != null ? String(player.id) : undefined,
    })
  }

  const byKey = new Map()
  for (const row of rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, row)
  }
  const unique = [...byKey.values()].sort((a, b) => a.adp - b.adp)
  if (unique.length < 50) {
    throw new Error(`ESPN returned only ${unique.length} ADP rows`)
  }
  return unique
}

const loadFixtureFile = async (relPath) => {
  const filePath = path.resolve(process.cwd(), relPath)
  const file = JSON.parse(await readFile(filePath, "utf8"))
  const rankings = Array.isArray(file.rankings) ? file.rankings : []
  return rankings
    .map((row) => ({
      name: row.name,
      adp: Number(row.adp ?? row.rank),
      key: normalizeName(row.name),
      espnId: row.espnId != null ? String(row.espnId) : undefined,
    }))
    .filter((row) => row.name && Number.isFinite(row.adp) && row.adp > 0)
}

const loadFixtureRows = async () => {
  try {
    const rows = await loadFixtureFile(fixtureRel)
    if (rows.length >= 50) return rows
  } catch {
    // fall through to legacy article fixture
  }
  return loadFixtureFile(LEGACY_ARTICLE_FIXTURE)
}

const saveFixture = async (rows) => {
  const payload = {
    meta: {
      source: SOURCE_ID,
      label: "ESPN averageDraftPosition",
      seasonId,
      api: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${seasonId}/players`,
      fetchedAt: new Date().toISOString(),
      count: rows.length,
      note: "ESPN Fantasy ownership.averageDraftPosition",
    },
    rankings: rows.map((row) => ({
      name: row.name,
      adp: row.adp,
      ...(row.espnId ? { espnId: row.espnId } : {}),
    })),
  }
  await writeFile(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  console.log(`Wrote fixture ${fixturePath} (${rows.length} ADP rows)`)
}

const loadRows = async () => {
  if (forceFixture) {
    const rows = await loadFixtureRows()
    if (rows.length < 50) {
      throw new Error(`Fixture has only ${rows.length} ESPN ADP rows`)
    }
    return { rows, source: "fixture" }
  }

  try {
    const rows = await fetchEspnAdpLive()
    if (writeFixture) await saveFixture(rows)
    return { rows, source: "live" }
  } catch (error) {
    console.warn(`Live ESPN failed (${error.message}); trying fixture…`)
    const rows = await loadFixtureRows()
    if (rows.length < 50) {
      throw new Error(
        `Live ESPN failed and fixture has only ${rows.length} ADP rows`,
      )
    }
    return { rows, source: "fixture" }
  }
}

const main = async () => {
  const { rows, source } = await loadRows()

  const pool = JSON.parse(await readFile(inPath, "utf8"))
  if (!Array.isArray(pool.players)) {
    throw new Error(`Expected players[] in ${inRel}`)
  }

  const { pool: withSource, matched } = applySourceRanks(
    pool,
    SOURCE_ID,
    rows.map((row) => ({ name: row.name, adp: row.adp })),
    {
      url: `https://fantasy.espn.com/basketball/players/add?leagueId=0&seasonId=${seasonId}`,
    },
  )

  const playersByKey = new Map(
    withSource.players.map((player) => [normalizeName(player.name), player]),
  )

  let added = 0
  for (const row of rows.slice(0, 200)) {
    const key = normalizeName(row.name)
    if (playersByKey.has(key)) continue

    const stub = {
      id: row.espnId ? `espn-${row.espnId}` : `espn-adp-${key.replace(/\s+/g, "-")}`,
      name: row.name,
      positions: ["SF"],
      projections: { ...EMPTY_PROJECTIONS },
      adp: row.adp,
      adpBySource: {
        [SOURCE_ID]: row.adp,
      },
      status: "active",
      ...(row.espnId ? { espnId: row.espnId } : {}),
    }
    withSource.players.push(stub)
    playersByKey.set(key, stub)
    added += 1
  }

  const primarySource = primaryEspn
    ? SOURCE_ID
    : (withSource.meta?.adpPrimaryDefault ?? "yahoo_draft_analysis_rank")

  const next = projectPrimary(withSource, primarySource)
  next.meta = {
    ...next.meta,
    adpArticleParsed: rows.length,
    adpArticleMatched: matched,
    adpFetchSource: source,
  }

  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")

  console.log(`ESPN ADP rows (${source}): ${rows.length}`)
  console.log(`Matched onto pool: ${matched}`)
  console.log(`Added missing ranked players: ${added}`)
  console.log(`Primary source: ${primarySource}`)
  console.log(
    `Top 12: ${next.players
      .slice(0, 12)
      .map((player) => `${player.adp}. ${player.name}`)
      .join(" | ")}`,
  )
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
