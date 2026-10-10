/**
 * Re-project player.adp from the selected Primary without refetching sources.
 *
 * Usage:
 *   node scripts/merge-adp-sources.mjs
 *   node scripts/merge-adp-sources.mjs --in=data/players/proj_2026_27.json
 *   node scripts/merge-adp-sources.mjs --primary=yahoo_draft_analysis_rank
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { DEFAULT_ADP_SOURCE, projectPrimary } from "./lib/adp-pool.mjs"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=")
    return [key, value]
  }),
)

const inRel = args.in ?? "data/players/proj_2026_27.json"
const outRel = args.out ?? inRel
const inPath = path.resolve(process.cwd(), inRel)
const outPath = path.resolve(process.cwd(), outRel)

const main = async () => {
  const pool = JSON.parse(await readFile(inPath, "utf8"))
  if (!Array.isArray(pool.players)) {
    throw new Error(`Expected players[] in ${inRel}`)
  }

  const primary = args.primary ?? pool.meta?.adpPrimaryDefault ?? DEFAULT_ADP_SOURCE
  const next = projectPrimary(pool, primary)

  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  console.log(`Projected primary=${primary}; players=${next.players.length}`)
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
