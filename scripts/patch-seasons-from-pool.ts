import "dotenv/config"

import { readFile } from "node:fs/promises"
import path from "node:path"

import { db } from "../src/lib/db"
import { applyPoolProjections } from "../src/lib/players/applyPoolProjections"
import { resolveSeasonPatchMode } from "../src/lib/players/projectionOverlayCli"
import type { SeasonLeagueState } from "../src/lib/season/types"

const DEFAULT_POOL_PATH = "data/players/proj_2026_27.json"

const rawArgs = process.argv.slice(2)
const args = Object.fromEntries(
  rawArgs
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=")
      return [key, value]
    }),
)

const parseBoolean = (value: string | undefined, optionName: string): boolean => {
  if (value === undefined || value === "false") return false
  if (value === "true") return true
  throw new Error(`${optionName} must be true or false`)
}

const main = async () => {
  const poolArg = args.pool ?? DEFAULT_POOL_PATH
  const poolPath = path.resolve(process.cwd(), poolArg)
  const dryRun = parseBoolean(args["dry-run"], "--dry-run")
  const skipSeasons = parseBoolean(args["skip-seasons"], "--skip-seasons")
  const seasonMode = resolveSeasonPatchMode({
    skipSeasons,
    seasonLeagueId: args["season-league-id"],
  })

  const pool = JSON.parse(await readFile(poolPath, "utf8")) as {
    players?: Parameters<typeof applyPoolProjections>[1]
  }
  if (!Array.isArray(pool.players)) {
    throw new Error(`Player pool has no players array: ${poolArg}`)
  }

  if (seasonMode.mode === "none") {
    console.log("Skipping season leagues (--skip-seasons)")
    return
  }

  const patchOne = async (id: string) => {
    const seasonLeague = await db.seasonLeague.findUnique({ where: { id } })
    if (!seasonLeague) {
      console.warn(`Season league not found: ${id}`)
      return { ok: false as const, matched: 0, unmatched: 0 }
    }
    const seasonState = JSON.parse(seasonLeague.stateJson) as SeasonLeagueState
    if (!Array.isArray(seasonState.players)) {
      console.warn(`Season league has no players array (skipped): ${id}`)
      return { ok: true as const, matched: 0, unmatched: 0, skipped: true }
    }

    const { players, report } = applyPoolProjections(
      seasonState.players,
      pool.players!,
    )

    console.log(
      `Season ${id}: matched ${report.matched.length}, unmatched ${report.unmatched.length}`,
    )

    if (dryRun) {
      return {
        ok: true as const,
        matched: report.matched.length,
        unmatched: report.unmatched.length,
      }
    }

    await db.seasonLeague.update({
      where: { id },
      data: {
        stateJson: JSON.stringify({
          ...seasonState,
          players,
        }),
      },
    })
    return {
      ok: true as const,
      matched: report.matched.length,
      unmatched: report.unmatched.length,
    }
  }

  if (dryRun) {
    console.log(`Dry run against pool ${poolArg}`)
  }

  let failed = false
  let totalMatched = 0
  if (seasonMode.mode === "one") {
    const result = await patchOne(seasonMode.id)
    if (!result.ok) failed = true
    totalMatched += result.matched
  } else {
    const leagues = await db.seasonLeague.findMany({ select: { id: true } })
    console.log(`Patching ${leagues.length} season league(s) from ${poolArg}`)
    for (const league of leagues) {
      try {
        const result = await patchOne(league.id)
        if (!result.ok) failed = true
        totalMatched += result.matched
      } catch (error) {
        failed = true
        console.error(
          `Season league ${league.id} failed: ${
            error instanceof Error ? error.message : error
          }`,
        )
      }
    }
  }

  console.log(`Total matched player overlays: ${totalMatched}`)
  if (failed) process.exitCode = 2
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
