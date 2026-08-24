/**
 * Overlay ESPN published 2026-27 H2H Points rankings onto the player pool.
 *
 * Uses a checked-in fixture (ESPN bot-blocks live fetches). Rebuild fixture
 * via scripts/_build-espn-ranks-fixture.mjs when the article updates.
 *
 * Usage:
 *   node scripts/refresh-espn-rankings.mjs
 *   node scripts/refresh-espn-rankings.mjs --in=data/players/proj_2026_27.json
 *   node scripts/refresh-espn-rankings.mjs --primary=espn
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  applySourceRanks,
  normalizeName,
  projectPrimary,
} from "./lib/adp-pool.mjs"

const RANKINGS_FIXTURE =
  "data/players/espn_h2h_points_rankings_2026_27.json"
const SOURCE_ID = "espn_article_h2h_points"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel
const ranksRel = args.ranks ?? RANKINGS_FIXTURE
const primaryEspn = args.primary === "espn"
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)
const ranksPath = path.resolve(process.cwd(), ranksRel)

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

  const rows = articleRanks
    .map((row) => ({
      name: row.name,
      adp: Number(row.rank),
      positions: row.positions,
    }))
    .filter((row) => row.name && Number.isFinite(row.adp) && row.adp > 0)

  const { pool: withSource, matched } = applySourceRanks(
    pool,
    SOURCE_ID,
    rows,
    { url: ranksFile.meta?.url ?? null },
  )

  const playersByKey = new Map(
    withSource.players.map((player) => [normalizeName(player.name), player]),
  )

  let added = 0
  const addedNames = []

  for (const row of rows) {
    const key = normalizeName(row.name)
    if (playersByKey.has(key)) continue

    const stub = {
      id: `espn-rank-${row.adp}-${key.replace(/\s+/g, "-")}`,
      name: row.name,
      positions: row.positions?.length ? row.positions : ["SF"],
      projections: { ...EMPTY_PROJECTIONS },
      adp: row.adp,
      adpBySource: {
        [SOURCE_ID]: row.adp,
      },
      status: "active",
    }
    withSource.players.push(stub)
    playersByKey.set(key, stub)
    added += 1
    addedNames.push(row.name)
  }

  const primarySource = primaryEspn
    ? SOURCE_ID
    : (withSource.meta?.adpPrimaryDefault ?? "yahoo_draft_analysis_rank")

  const next = projectPrimary(withSource, primarySource)
  next.meta = {
    ...next.meta,
    adpArticleParsed: articleRanks.length,
    adpArticleMatched: matched,
    adpArticleAdded: added,
    count: next.players.length,
  }

  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")

  console.log(`ESPN article ranks loaded: ${articleRanks.length}`)
  console.log(`Matched onto pool: ${matched}`)
  console.log(`Added missing ranked players: ${added}`)
  console.log(`Primary source: ${primarySource}`)
  if (addedNames.length) {
    console.log(`Added sample: ${addedNames.slice(0, 12).join(", ")}`)
  }
  console.log(
    `Top 12: ${next.players
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
    const hit = next.players.find((player) => player.name === name)
    const espnRank = hit?.adpBySource?.[SOURCE_ID]
    console.log(
      name,
      hit
        ? `adp=${hit.adp}${espnRank != null ? ` espn=${espnRank}` : ""}`
        : "MISSING",
    )
  }
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
