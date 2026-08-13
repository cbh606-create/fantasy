import { readFile } from "node:fs/promises"
import path from "node:path"
import samplePlayers from "../../../data/fixtures/players-sample.json"
import type { Player } from "@/lib/domain/types"

export type PlayerPoolSource = "stats_2025_26" | "proj_2026_27" | "sample"

type PlayerPoolFile = {
  meta?: {
    source?: string
    fantasySeason?: number
    nbaSeasonLabel?: string
    generatedAt?: string
    count?: number
  }
  players: Player[]
}

type PlayerPoolResult = {
  source: PlayerPoolSource
  players: Player[]
  fallbackUsed: boolean
  meta?: PlayerPoolFile["meta"]
}

const DEFAULT_SOURCE: PlayerPoolSource =
  (process.env.PLAYER_POOL_SOURCE as PlayerPoolSource | undefined) ||
  "proj_2026_27"

const poolCache = new Map<PlayerPoolSource, Promise<PlayerPoolResult>>()

const poolPath = (source: Exclude<PlayerPoolSource, "sample">) =>
  path.join(process.cwd(), "data", "players", `${source}.json`)

const loadPoolFile = async (
  source: PlayerPoolSource,
): Promise<PlayerPoolFile | null> => {
  if (source === "sample") {
    return {
      meta: { source: "sample", count: samplePlayers.length },
      players: samplePlayers as Player[],
    }
  }

  try {
    const raw = await readFile(poolPath(source), "utf8")
    return JSON.parse(raw) as PlayerPoolFile
  } catch {
    return null
  }
}

const resolvePlayerPool = async (
  source: PlayerPoolSource,
): Promise<PlayerPoolResult> => {
  const primary = await loadPoolFile(source)
  if (primary?.players?.length) {
    return {
      source,
      players: primary.players,
      fallbackUsed: false,
      meta: primary.meta,
    }
  }

  if (source !== "proj_2026_27") {
    const projPool = await loadPoolFile("proj_2026_27")
    if (projPool?.players?.length) {
      return {
        source: "proj_2026_27",
        players: projPool.players,
        fallbackUsed: true,
        meta: projPool.meta,
      }
    }
  }

  if (source !== "stats_2025_26") {
    const statsPool = await loadPoolFile("stats_2025_26")
    if (statsPool?.players?.length) {
      return {
        source: "stats_2025_26",
        players: statsPool.players,
        fallbackUsed: true,
        meta: statsPool.meta,
      }
    }
  }

  return {
    source: "sample",
    players: samplePlayers as Player[],
    fallbackUsed: true,
    meta: { source: "sample", count: samplePlayers.length },
  }
}

export const getPlayerPool = async (
  source: PlayerPoolSource = DEFAULT_SOURCE,
): Promise<PlayerPoolResult> => {
  const cached = poolCache.get(source)
  if (cached) return cached

  const pending = resolvePlayerPool(source)
  poolCache.set(source, pending)

  try {
    return await pending
  } catch (error) {
    poolCache.delete(source)
    throw error
  }
}
