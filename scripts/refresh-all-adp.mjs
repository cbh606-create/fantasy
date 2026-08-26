/**
 * Refresh all mock-draft ADP / rank sources onto the player pool in one shot.
 *
 * Live-fetches Yahoo overall rank + FantasyPros Yahoo ADP (writes fixtures),
 * reapplies ESPN article ranks from fixture, then merges Primary ADP.
 *
 * Usage:
 *   node scripts/refresh-all-adp.mjs
 *   node scripts/refresh-all-adp.mjs --fixture          # offline: use checked-in fixtures
 *   node scripts/refresh-all-adp.mjs --in=data/players/proj_2026_27.json
 *   npm run players:adp-refresh
 */

import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const passthrough = process.argv.slice(2)
const forceFixture = passthrough.some(
  (arg) => arg === "--fixture" || arg.startsWith("--fixture="),
)

const runNode = (scriptRel, extraArgs = []) =>
  new Promise((resolve, reject) => {
    const scriptPath = path.join(root, scriptRel)
    const args = [scriptPath, ...passthrough, ...extraArgs]
    console.log(`\n› node ${[scriptRel, ...passthrough, ...extraArgs].join(" ")}`)
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptRel} exited with code ${code ?? "null"}`))
    })
  })

const main = async () => {
  // Live sources: refresh fixtures when online so frequent re-runs stay current.
  const liveExtra = forceFixture ? [] : ["--write-fixture"]

  await runNode("scripts/refresh-yahoo-adp.mjs", liveExtra)
  await runNode("scripts/refresh-fantasypros-adp.mjs", liveExtra)
  // ESPN article ranks stay fixture-backed (live page is bot-blocked).
  await runNode("scripts/refresh-espn-rankings.mjs")
  await runNode("scripts/merge-adp-sources.mjs")

  console.log("\nAll ADP sources refreshed.")
  if (!forceFixture) {
    console.log(
      "Fixtures updated for Yahoo + FantasyPros. Commit data/players/* when ready.",
    )
  }
  console.log(
    "ESPN ranks still use the checked-in article fixture — rebuild when the ESPN list changes.",
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
