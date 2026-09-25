import "dotenv/config"

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { db } from "../src/lib/db"
import {
  applyHashtagProjections,
  parseHashtagCsv,
  type Projections,
} from "../src/lib/players/hashtagImport"
import {
  buildYahooOverlayMeta,
  resolveSeasonPatchMode,
} from "../src/lib/players/projectionOverlayCli"
import type { SeasonLeagueState } from "../src/lib/season/types"

const DEFAULT_POOL_PATH = "data/players/proj_2026_27.json"
const DEFAULT_GP = 70

type PoolPlayer = {
  id: string
  name: string
  teamAbbr?: string
  projections: Projections
  shooting?: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
  [key: string]: unknown
}

type PoolFile = {
  meta: Record<string, unknown>
  players: PoolPlayer[]
}

const rawArgs = process.argv.slice(2)
const csvArg = rawArgs.find((arg) => !arg.startsWith("--"))
const args = Object.fromEntries(
  rawArgs
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=")
      return [key, value]
    }),
)

const parseBoolean = (value: string | undefined, optionName: string): boolean => {
  if (value === undefined || value === "false") {
    return false
  }
  if (value === "true") {
    return true
  }
  throw new Error(`${optionName} must be true or false`)
}

const parseGpDefault = (value: string | undefined): number => {
  const gpDefault = Number(value ?? DEFAULT_GP)
  if (!Number.isFinite(gpDefault) || gpDefault <= 0) {
    throw new Error("--gp-default must be a positive number")
  }
  return gpDefault
}

const readPool = async (poolPath: string): Promise<PoolFile> => {
  const pool = JSON.parse(await readFile(poolPath, "utf8")) as Partial<PoolFile>
  if (!Array.isArray(pool.players)) {
    throw new Error(`Player pool has no players array: ${poolPath}`)
  }
  return {
    meta: pool.meta ?? {},
    players: pool.players,
  }
}

const main = async () => {
  if (!csvArg) {
    throw new Error(
      "Usage: npm run players:import-yahoo -- <csv-path> [--dry-run] [--pool=path] [--gp-default=70] [--per-game=true] [--skip-seasons] [--season-league-id=id]",
    )
  }

  const csvPath = path.resolve(process.cwd(), csvArg)
  const poolArg = args.pool ?? DEFAULT_POOL_PATH
  const poolPath = path.resolve(process.cwd(), poolArg)
  const dryRun = parseBoolean(args["dry-run"], "--dry-run")
  const perGame = args["per-game"] === undefined
    ? true
    : parseBoolean(args["per-game"], "--per-game")
  const gpDefault = parseGpDefault(args["gp-default"])
  const skipSeasons = parseBoolean(args["skip-seasons"], "--skip-seasons")
  const seasonMode = resolveSeasonPatchMode({
    skipSeasons,
    seasonLeagueId: args["season-league-id"],
  })

  const rows = parseHashtagCsv(await readFile(csvPath, "utf8"))
  const pool = await readPool(poolPath)
  const result = applyHashtagProjections(pool.players, rows, {
    perGame,
    gpDefault,
  })

  console.log(`Parsed: ${rows.length}`)
  console.log(`Matched: ${result.report.matched.length}`)
  console.log(`Unmatched: ${result.report.unmatched.length}`)
  for (const unmatched of result.report.unmatched) {
    console.log(`  - ${unmatched.name}`)
  }
  console.log(`Ambiguous: ${result.report.ambiguous.length}`)
  for (const ambiguous of result.report.ambiguous) {
    console.log(`  - ${ambiguous.name} (${ambiguous.playerIds.join(", ")})`)
  }

  if (dryRun) {
    console.log(`Dry run: no changes written to ${poolArg}`)
    if (seasonMode.mode === "all") {
      console.log("Dry run: would patch all season leagues")
    } else if (seasonMode.mode === "one") {
      console.log(`Dry run: would patch season league ${seasonMode.id}`)
    }
    return
  }

  const nextPool: PoolFile = {
    ...pool,
    meta: {
      ...pool.meta,
      ...buildYahooOverlayMeta({
        sourceFile: csvArg,
        parsed: rows.length,
        report: result.report,
      }),
    },
    players: result.players,
  }

  await writeFile(poolPath, `${JSON.stringify(nextPool, null, 2)}\n`, "utf8")
  console.log(`Wrote projection overlay to ${poolArg}`)

  const patchOne = async (id: string) => {
    const seasonLeague = await db.seasonLeague.findUnique({ where: { id } })
    if (!seasonLeague) {
      console.warn(`Season league not found: ${id}`)
      return false
    }
    const seasonState = JSON.parse(seasonLeague.stateJson) as SeasonLeagueState
    if (!Array.isArray(seasonState.players)) {
      throw new Error(`Season league has no players array: ${id}`)
    }
    const seasonResult = applyHashtagProjections(seasonState.players, rows, {
      perGame,
      gpDefault,
    })
    await db.seasonLeague.update({
      where: { id },
      data: {
        stateJson: JSON.stringify({
          ...seasonState,
          players: seasonResult.players,
        }),
      },
    })
    console.log(
      `Wrote projection overlay to season league ${id} (matched ${seasonResult.report.matched.length})`,
    )
    return true
  }

  if (seasonMode.mode === "none") return

  try {
    let failed = false
    if (seasonMode.mode === "one") {
      const ok = await patchOne(seasonMode.id)
      if (!ok) failed = true
    } else {
      const leagues = await db.seasonLeague.findMany({ select: { id: true } })
      console.log(`Patching ${leagues.length} season league(s)`)
      for (const league of leagues) {
        try {
          const ok = await patchOne(league.id)
          if (!ok) failed = true
        } catch (error) {
          failed = true
          console.error(
            `Season league ${league.id} failed: ${error instanceof Error ? error.message : error}`,
          )
        }
      }
    }
    if (failed) process.exitCode = 2
  } catch (error) {
    console.error(
      `Season league update failed: ${error instanceof Error ? error.message : error}`,
    )
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
