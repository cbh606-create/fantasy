/**
 * Overlay FantasyPros Yahoo-column ADP onto the local player pool JSON.
 *
 * Usage:
 *   node scripts/refresh-fantasypros-adp.mjs
 *   node scripts/refresh-fantasypros-adp.mjs --in=data/players/proj_2026_27.json
 *   node scripts/refresh-fantasypros-adp.mjs --fixture
 *   node scripts/refresh-fantasypros-adp.mjs --fixture=data/players/fantasypros_yahoo_adp_2026_27.json
 *   node scripts/refresh-fantasypros-adp.mjs --write-fixture
 *   node scripts/refresh-fantasypros-adp.mjs --primary=fantasypros_yahoo
 *
 * Source: https://www.fantasypros.com/nba/adp/overall.php (Yahoo column)
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applySourceRanks,
  DEFAULT_ADP_SOURCE,
  normalizeName,
  projectPrimary,
} from "./lib/adp-pool.mjs"

const FANTASYPROS_ADP_URL = "https://www.fantasypros.com/nba/adp/overall.php"
const SOURCE_ID = "fantasypros_yahoo"
const FIXTURE_REL = "data/players/fantasypros_yahoo_adp_2026_27.json"
const USER_AGENT =
  "fantasy-draft-tool/0.1 (local ADP refresh; +https://github.com/cbh606-create/fantasy)"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel
const fixtureRel =
  args.ranks ??
  (typeof args.fixture === "string" && args.fixture !== "true"
    ? args.fixture
    : FIXTURE_REL)
const forceFixture =
  args.fixture === "true" ||
  (typeof args.fixture === "string" && args.fixture !== "true")
const writeFixture = args["write-fixture"] === "true"
const primaryArg = args.primary
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)
const fixturePath = path.resolve(process.cwd(), fixtureRel)

const parseYahooAdp = (html) => {
  const rows = []
  const rowPattern =
    /fp-player-name="([^"]+)"[\s\S]*?<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g

  for (const match of html.matchAll(rowPattern)) {
    const name = match[1].trim()
    const yahooRaw = match[2].trim()
    const yahoo = Number.parseFloat(yahooRaw)

    if (!name || !Number.isFinite(yahoo) || yahoo <= 0) continue

    rows.push({
      name,
      adp: yahoo,
      key: normalizeName(name),
    })
  }

  return rows
}

const fetchFantasyProsLive = async () => {
  const response = await fetch(FANTASYPROS_ADP_URL, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html",
    },
  })

  if (!response.ok) {
    throw new Error(`FantasyPros fetch failed: ${response.status}`)
  }

  const html = await response.text()
  const rows = parseYahooAdp(html)

  const byKey = new Map()
  for (const row of rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, row)
  }

  const unique = [...byKey.values()].sort((a, b) => a.adp - b.adp)
  if (unique.length < 50) {
    throw new Error(
      `Parsed only ${unique.length} Yahoo ADP rows — page shape may have changed`,
    )
  }
  return unique
}

const loadFixtureRanks = async () => {
  const file = JSON.parse(await readFile(fixturePath, "utf8"))
  const rankings = Array.isArray(file.rankings) ? file.rankings : []
  return rankings
    .map((row) => ({
      name: row.name,
      adp: Number(row.adp),
      key: normalizeName(row.name),
    }))
    .filter((row) => row.name && Number.isFinite(row.adp) && row.adp > 0)
}

const saveFixture = async (rows) => {
  const payload = {
    meta: {
      source: SOURCE_ID,
      url: FANTASYPROS_ADP_URL,
      fetchedAt: new Date().toISOString(),
      count: rows.length,
    },
    rankings: rows.map((row) => ({ name: row.name, adp: row.adp })),
  }
  await writeFile(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  console.log(`Wrote fixture ${fixturePath} (${rows.length} ranks)`)
}

const loadRanks = async () => {
  if (forceFixture) {
    const rows = await loadFixtureRanks()
    if (rows.length < 1) {
      throw new Error(`Fixture has only ${rows.length} ranks in ${fixtureRel}`)
    }
    return { rows, source: "fixture" }
  }

  try {
    const rows = await fetchFantasyProsLive()
    if (writeFixture) await saveFixture(rows)
    return { rows, source: "live" }
  } catch (error) {
    console.warn(`Live FantasyPros failed (${error.message}); trying fixture…`)
    const rows = await loadFixtureRanks()
    if (rows.length < 1) {
      throw new Error(
        `Live FantasyPros failed and fixture has only ${rows.length} ranks in ${fixtureRel}`,
      )
    }
    return { rows, source: "fixture" }
  }
}

const main = async () => {
  const { rows, source } = await loadRanks()

  const pool = JSON.parse(await readFile(inPath, "utf8"))
  if (!Array.isArray(pool.players)) {
    throw new Error(`Expected players[] in ${inRel}`)
  }

  const { pool: withSource, matched, unmatched } = applySourceRanks(
    pool,
    SOURCE_ID,
    rows.map((row) => ({ name: row.name, adp: row.adp })),
    { url: FANTASYPROS_ADP_URL },
  )

  const primary =
    primaryArg ?? withSource.meta?.adpPrimaryDefault ?? DEFAULT_ADP_SOURCE

  const projected = projectPrimary(withSource, primary)
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

  console.log(`FantasyPros Yahoo ADP rows (${source}): ${rows.length}`)
  console.log(`Matched onto pool: ${matched}/${pool.players.length}`)
  console.log(`Unmatched (kept prior ADP): ${unmatched}`)
  console.log(`Primary source: ${primary}`)
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
