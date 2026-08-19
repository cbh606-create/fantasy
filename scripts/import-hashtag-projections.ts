import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  applyHashtagProjections,
  parseHashtagCsv,
  type Projections,
} from "../src/lib/players/hashtagImport"

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
      "Usage: npm run players:import-hashtag -- <csv-path> [--dry-run] [--pool=path] [--gp-default=70] [--per-game=true]",
    )
  }

  const csvPath = path.resolve(process.cwd(), csvArg)
  const poolArg = args.pool ?? DEFAULT_POOL_PATH
  const poolPath = path.resolve(process.cwd(), poolArg)
  const dryRun = parseBoolean(args["dry-run"], "--dry-run")
  const perGame = parseBoolean(args["per-game"], "--per-game")
  const gpDefault = parseGpDefault(args["gp-default"])

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
    return
  }

  const nextPool: PoolFile = {
    ...pool,
    meta: {
      ...pool.meta,
      hashtagImportedAt: new Date().toISOString(),
      hashtagSourceFile: csvArg,
      hashtagParsed: rows.length,
      hashtagMatched: result.report.matched.length,
      hashtagUnmatched: result.report.unmatched.length,
      hashtagAmbiguous: result.report.ambiguous.length,
      projectionOverlay: "hashtag",
    },
    players: result.players,
  }

  await writeFile(poolPath, `${JSON.stringify(nextPool, null, 2)}\n`, "utf8")
  console.log(`Wrote projection overlay to ${poolArg}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
