/**
 * Refresh selectable mock-draft ADP sources onto the player pool.
 *
 * Live-fetches Yahoo average_pick + ESPN averageDraftPosition (writes fixtures),
 * then merges Primary ADP.
 *
 * Usage:
 *   node scripts/refresh-all-adp.mjs
 *   node scripts/refresh-all-adp.mjs --fixture
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
  const liveExtra = forceFixture ? [] : ["--write-fixture"]

  await runNode("scripts/refresh-yahoo-adp.mjs", liveExtra)
  await runNode("scripts/refresh-espn-rankings.mjs", liveExtra)
  await runNode("scripts/merge-adp-sources.mjs")

  console.log("\nADP sources refreshed (Yahoo + ESPN).")
  if (!forceFixture) {
    console.log("Fixtures updated. Commit data/players/* when ready.")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
