/**
 * Overlay Yahoo ADP from FantasyPros onto the local player pool JSON.
 *
 * Usage:
 *   node scripts/refresh-yahoo-adp.mjs
 *   node scripts/refresh-yahoo-adp.mjs --in=data/players/stats_2025_26.json --out=data/players/stats_2025_26.json
 *
 * Source: https://www.fantasypros.com/nba/adp/overall.php (Yahoo column)
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const FANTASYPROS_ADP_URL = "https://www.fantasypros.com/nba/adp/overall.php"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/stats_2025_26.json"
const outRel = args.out ?? inRel
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)

const normalizeName = (name) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/['’]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

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
      yahoo,
      key: normalizeName(name),
    })
  }

  return rows
}

const main = async () => {
  const response = await fetch(FANTASYPROS_ADP_URL, {
    headers: {
      "user-agent":
        "fantasy-draft-tool/0.1 (local ADP refresh; +https://github.com/cbh606-create/fantasy)",
      accept: "text/html",
    },
  })

  if (!response.ok) {
    throw new Error(`FantasyPros fetch failed: ${response.status}`)
  }

  const html = await response.text()
  const yahooRows = parseYahooAdp(html)

  if (yahooRows.length < 50) {
    throw new Error(
      `Parsed only ${yahooRows.length} Yahoo ADP rows — page shape may have changed`,
    )
  }

  const yahooByKey = new Map()
  for (const row of yahooRows) {
    if (!yahooByKey.has(row.key)) {
      yahooByKey.set(row.key, row.yahoo)
    }
  }

  const pool = JSON.parse(await readFile(inPath, "utf8"))
  if (!Array.isArray(pool.players)) {
    throw new Error(`Expected players[] in ${inRel}`)
  }

  let matched = 0
  let unmatched = 0
  const unmatchedNames = []

  const players = pool.players.map((player) => {
    const key = normalizeName(player.name)
    const yahoo = yahooByKey.get(key)

    if (yahoo === undefined) {
      unmatched += 1
      if (unmatchedNames.length < 20) unmatchedNames.push(player.name)
      return player
    }

    matched += 1
    return {
      ...player,
      adp: yahoo,
    }
  })

  const next = {
    ...pool,
    meta: {
      ...pool.meta,
      adpSource: "fantasypros_yahoo",
      adpSourceUrl: FANTASYPROS_ADP_URL,
      adpUpdatedAt: new Date().toISOString(),
      adpMatched: matched,
      adpUnmatched: unmatched,
    },
    players,
  }

  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")

  console.log(`Yahoo ADP rows parsed: ${yahooRows.length}`)
  console.log(`Matched onto pool: ${matched}/${pool.players.length}`)
  console.log(`Unmatched (kept prior ADP): ${unmatched}`)
  if (unmatchedNames.length) {
    console.log(`Unmatched sample: ${unmatchedNames.join(", ")}`)
  }
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
