/**
 * Overlay ESPN published 2026-27 H2H Points rankings onto the player pool.
 *
 * Uses a checked-in fixture (ESPN bot-blocks live fetches). Rebuild fixture
 * via scripts/_build-espn-ranks-fixture.mjs when the article updates.
 *
 * Usage:
 *   node scripts/refresh-espn-rankings.mjs
 *   node scripts/refresh-espn-rankings.mjs --in=data/players/proj_2026_27.json
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const RANKINGS_FIXTURE =
  "data/players/espn_h2h_points_rankings_2026_27.json"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel
const ranksRel = args.ranks ?? RANKINGS_FIXTURE
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)
const ranksPath = path.resolve(process.cwd(), ranksRel)

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

const main = async () => {
  const ranksFile = JSON.parse(await readFile(ranksPath, "utf8"))
  const articleRanks = Array.isArray(ranksFile.rankings)
    ? ranksFile.rankings
    : []

  if (articleRanks.length < 100) {
    throw new Error(
      `Expected 100+ rankings in ${ranksRel}, got ${articleRanks.length}`,
    )
  }

  const pool = JSON.parse(await readFile(inPath, "utf8"))
  if (!Array.isArray(pool.players)) {
    throw new Error(`Expected players[] in ${inRel}`)
  }

  const playersByKey = new Map(
    pool.players.map((player) => [normalizeName(player.name), player]),
  )

  let matched = 0
  let added = 0
  const addedNames = []

  for (const row of articleRanks) {
    const key = normalizeName(row.name)
    const existing = playersByKey.get(key)
    if (existing) {
      existing.adp = row.rank
      matched += 1
      continue
    }

    const stub = {
      id: `espn-rank-${row.rank}-${key.replace(/\s+/g, "-")}`,
      name: row.name,
      positions: row.positions?.length ? row.positions : ["SF"],
      projections: { ...EMPTY_PROJECTIONS },
      adp: row.rank,
      status: "active",
    }
    pool.players.push(stub)
    playersByKey.set(key, stub)
    added += 1
    addedNames.push(row.name)
  }

  pool.players.sort((a, b) => a.adp - b.adp)

  const next = {
    ...pool,
    meta: {
      ...pool.meta,
      adpSource: "espn_article_h2h_points_overlay",
      adpSourceUrl: ranksFile.meta?.url ?? null,
      adpUpdatedAt: new Date().toISOString(),
      adpArticleParsed: articleRanks.length,
      adpArticleMatched: matched,
      adpArticleAdded: added,
      count: pool.players.length,
    },
    players: pool.players,
  }

  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")

  console.log(`ESPN article ranks loaded: ${articleRanks.length}`)
  console.log(`Matched onto pool: ${matched}`)
  console.log(`Added missing ranked players: ${added}`)
  if (addedNames.length) {
    console.log(`Added sample: ${addedNames.slice(0, 12).join(", ")}`)
  }
  console.log(
    `Top 12: ${pool.players
      .slice(0, 12)
      .map((player) => `${player.adp}. ${player.name}`)
      .join(" | ")}`,
  )
  for (const name of [
    "Cooper Flagg",
    "Cameron Boozer",
    "AJ Dybantsa",
    "Kon Knueppel",
    "Jeremiah Fears",
  ]) {
    const hit = pool.players.find((player) => player.name === name)
    console.log(name, hit ? `adp=${hit.adp}` : "MISSING")
  }
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
