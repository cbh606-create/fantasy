import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { PoolProjectionPlayer } from "@/lib/players/applyPoolProjections"

type PoolFile = {
  players: PoolProjectionPlayer[]
}

let cached:
  | { mtimeMs: number; players: PoolProjectionPlayer[] }
  | undefined

export const DEFAULT_PROJ_POOL_PATH = "data/players/proj_2026_27.json"

export const loadProjPoolPlayers = async (
  poolRel = DEFAULT_PROJ_POOL_PATH,
): Promise<PoolProjectionPlayer[]> => {
  const poolPath = path.resolve(process.cwd(), poolRel)
  const mtimeMs = (await stat(poolPath)).mtimeMs
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.players
  }

  const parsed = JSON.parse(await readFile(poolPath, "utf8")) as Partial<PoolFile>
  if (!Array.isArray(parsed.players)) {
    throw new Error(`Player pool has no players array: ${poolRel}`)
  }

  cached = { mtimeMs, players: parsed.players }
  return parsed.players
}
