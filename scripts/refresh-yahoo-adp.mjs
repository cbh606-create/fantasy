/**
 * Overlay Yahoo mock/draft ADP (draft_analysis.average_pick) onto the player pool.
 *
 * Free public API exposes average_pick via out=draft_analysis (same values shown
 * in Yahoo mock drafts). Stored as adpBySource.yahoo_draft_analysis_rank.
 *
 * Usage:
 *   node scripts/refresh-yahoo-adp.mjs
 *   node scripts/refresh-yahoo-adp.mjs --in=data/players/proj_2026_27.json
 *   node scripts/refresh-yahoo-adp.mjs --fixture
 *   node scripts/refresh-yahoo-adp.mjs --write-fixture
 *
 * Source: https://basketball.fantasysports.yahoo.com/nba/draftanalysis?type=standard
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applySourceRanks,
  normalizeName,
  projectPrimary,
} from "./lib/adp-pool.mjs"

const YAHOO_PAGE_URL =
  "https://basketball.fantasysports.yahoo.com/nba/draftanalysis?type=standard"
const YAHOO_API_BASE =
  "https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/league/478.l.public/players"
const SOURCE_ID = "yahoo_draft_analysis_rank"
const PAGE_SIZE = 25
const FIXTURE_REL = "data/players/yahoo_draft_analysis_rank_2026_27.json"
const USER_AGENT =
  "fantasy-draft-tool/0.1 (local Yahoo ADP refresh; +https://github.com/cbh606-create/fantasy)"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel
const fixtureRel = args.ranks ?? FIXTURE_REL
const forceFixture = args.fixture === "true"
const writeFixture = args["write-fixture"] === "true"
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)
const fixturePath = path.resolve(process.cwd(), fixtureRel)

const flattenPlayer = (playerNode) => {
  if (!playerNode) return null
  if (!Array.isArray(playerNode)) return playerNode
  return Object.assign(
    {},
    ...playerNode.filter(
      (part) => part && typeof part === "object" && !Array.isArray(part),
    ),
  )
}

const averagePick = (player) => {
  const raw =
    player?.draft_analysis?.average_pick ??
    player?.average_pick ??
    null
  if (raw === null || raw === undefined || raw === "-" || raw === "") {
    return null
  }
  const value = Number.parseFloat(String(raw))
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

const parseYahooPlayersPayload = (json) => {
  const league = json?.fantasy_content?.league
  const playersBlock = league?.players
  if (!playersBlock || typeof playersBlock !== "object") {
    return { rows: [], fetched: 0 }
  }

  const attrCount = Number(league?.["players:attributes"]?.count)
  const indexedKeys = Object.keys(playersBlock)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b)

  const limit =
    Number.isFinite(attrCount) && attrCount > 0
      ? attrCount
      : indexedKeys.length

  const rows = []
  for (let i = 0; i < limit; i += 1) {
    const entry = playersBlock[i] ?? playersBlock[String(i)]
    const player = flattenPlayer(entry?.player)
    if (!player?.name?.full) continue
    const adp = averagePick(player)
    if (adp === null) continue
    rows.push({
      name: player.name.full,
      adp,
      key: normalizeName(player.name.full),
    })
  }

  return { rows, fetched: limit }
}

const buildApiUrl = (start, count) =>
  `${YAHOO_API_BASE};position=ALL;start=${start};count=${count};sort=average_pick;out=draft_analysis?format=json_f`

const fetchYahooPage = async (start) => {
  const response = await fetch(buildApiUrl(start, PAGE_SIZE), {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Yahoo API fetch failed at start=${start}: ${response.status}`)
  }

  return response.json()
}

const fetchYahooAdpLive = async () => {
  const rows = []
  let start = 0

  for (let guard = 0; guard < 40; guard += 1) {
    const page = await fetchYahooPage(start)
    const { rows: pageRows, fetched } = parseYahooPlayersPayload(page)
    if (fetched === 0) break
    rows.push(...pageRows)
    if (fetched < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  const byKey = new Map()
  for (const row of rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, row)
  }

  const unique = [...byKey.values()].sort((a, b) => a.adp - b.adp)
  if (unique.length < 50) {
    throw new Error(`Yahoo API returned only ${unique.length} ADP rows`)
  }
  return unique
}

const loadFixtureRows = async () => {
  const file = JSON.parse(await readFile(fixturePath, "utf8"))
  const rankings = Array.isArray(file.rankings) ? file.rankings : []
  return rankings
    .map((row) => {
      const adp = Number(row.adp ?? row.rank)
      return {
        name: row.name,
        adp,
        key: normalizeName(row.name),
      }
    })
    .filter((row) => row.name && Number.isFinite(row.adp) && row.adp > 0)
}

const saveFixture = async (rows) => {
  const payload = {
    meta: {
      source: SOURCE_ID,
      url: YAHOO_PAGE_URL,
      api: YAHOO_API_BASE,
      fetchedAt: new Date().toISOString(),
      count: rows.length,
      note: "Yahoo draft_analysis.average_pick (mock/draft ADP)",
    },
    rankings: rows.map((row) => ({ name: row.name, adp: row.adp })),
  }
  await writeFile(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  console.log(`Wrote fixture ${fixturePath} (${rows.length} ADP rows)`)
}

const loadRows = async () => {
  if (forceFixture) {
    const rows = await loadFixtureRows()
    if (rows.length < 50) {
      throw new Error(`Fixture has only ${rows.length} rows in ${fixtureRel}`)
    }
    return { rows, source: "fixture" }
  }

  try {
    const rows = await fetchYahooAdpLive()
    if (writeFixture) await saveFixture(rows)
    return { rows, source: "live" }
  } catch (error) {
    console.warn(`Live Yahoo failed (${error.message}); trying fixture…`)
    const rows = await loadFixtureRows()
    if (rows.length < 50) {
      throw new Error(
        `Live Yahoo failed and fixture has only ${rows.length} rows in ${fixtureRel}`,
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

  const { pool: withSource, matched, unmatched } = applySourceRanks(
    pool,
    SOURCE_ID,
    rows.map((row) => ({ name: row.name, adp: row.adp })),
    { url: YAHOO_PAGE_URL },
  )
  const projected = projectPrimary(withSource, SOURCE_ID)
  const next = {
    ...projected,
    meta: {
      ...projected.meta,
      adpMatched: matched,
      adpUnmatched: unmatched,
      adpRankRows: rows.length,
      adpFetchSource: source,
    },
  }

  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")

  console.log(`Yahoo ADP rows (${source}): ${rows.length}`)
  console.log(`Matched onto pool: ${matched}/${pool.players.length}`)
  console.log(`Unmatched (kept prior ADP): ${unmatched}`)
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
