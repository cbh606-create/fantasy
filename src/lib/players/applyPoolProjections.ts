import type { CategoryId } from "@/lib/domain/types"
import { normalizeNbaTeamAbbr } from "@/lib/nba/teamAbbr"
import { normalizePlayerName } from "@/lib/players/hashtagImport"

export type PoolProjectionPlayer = {
  id: string
  name: string
  espnId?: string
  teamAbbr?: string
  status?: "active" | "out" | "gtd"
  projections: Record<CategoryId, number>
  projectedGames?: number
  shooting?: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

export type SeasonProjectionTarget = {
  id: string
  name: string
  teamAbbr?: string
  projections: Record<CategoryId, number>
  projectedGames?: number
  injuryStatus?: "out" | "gtd"
  shooting?: {
    FGM: number
    FGA: number
    FTM: number
    FTA: number
  }
}

export type ApplyPoolProjectionsReport = {
  matched: { playerId: string; poolId: string }[]
  unmatched: { playerId: string; name: string }[]
}

const idKeysFor = (player: {
  id: string
  espnId?: string
}): string[] => {
  const keys = new Set<string>()
  keys.add(player.id)
  if (player.id.startsWith("espn-")) {
    keys.add(player.id.slice(5))
  } else {
    keys.add(`espn-${player.id}`)
  }
  if (player.espnId) {
    keys.add(player.espnId)
    keys.add(`espn-${player.espnId}`)
  }
  return [...keys]
}

const poolIndexes = (poolPlayers: PoolProjectionPlayer[]) => {
  const byId = new Map<string, PoolProjectionPlayer>()
  for (const poolPlayer of poolPlayers) {
    for (const key of idKeysFor(poolPlayer)) {
      if (!byId.has(key)) byId.set(key, poolPlayer)
    }
  }

  const byName = new Map<string, PoolProjectionPlayer[]>()
  for (const poolPlayer of poolPlayers) {
    const key = normalizePlayerName(poolPlayer.name)
    const list = byName.get(key) ?? []
    list.push(poolPlayer)
    byName.set(key, list)
  }

  return { byId, byName }
}

const findPoolPlayer = (
  target: { id: string; name: string; teamAbbr?: string; espnId?: string },
  byId: Map<string, PoolProjectionPlayer>,
  byName: Map<string, PoolProjectionPlayer[]>,
): PoolProjectionPlayer | undefined => {
  for (const key of idKeysFor(target)) {
    const byKey = byId.get(key)
    if (byKey) return byKey
  }

  const nameMatches = byName.get(normalizePlayerName(target.name)) ?? []
  if (nameMatches.length === 1) return nameMatches[0]
  if (nameMatches.length > 1 && target.teamAbbr) {
    return nameMatches.find((candidate) => candidate.teamAbbr === target.teamAbbr)
  }
  return undefined
}

const injuryStatusFromPool = (
  status: PoolProjectionPlayer["status"],
): "out" | "gtd" | undefined =>
  status === "out" || status === "gtd" ? status : undefined

export const applyPoolInjuryStatus = <T extends SeasonProjectionTarget>(
  targets: T[],
  poolPlayers: PoolProjectionPlayer[],
): T[] => {
  const { byId, byName } = poolIndexes(poolPlayers)
  return targets.map((target) => {
    const poolPlayer = findPoolPlayer(target, byId, byName)
    if (!poolPlayer) return target
    const injuryStatus = injuryStatusFromPool(poolPlayer.status)
    if (target.injuryStatus === injuryStatus) return target
    return { ...target, injuryStatus }
  })
}

export const applyPoolProjections = <T extends SeasonProjectionTarget>(
  targets: T[],
  poolPlayers: PoolProjectionPlayer[],
): { players: T[]; report: ApplyPoolProjectionsReport } => {
  const { byId, byName } = poolIndexes(poolPlayers)

  const matched: ApplyPoolProjectionsReport["matched"] = []
  const unmatched: ApplyPoolProjectionsReport["unmatched"] = []

  const players = targets.map((target) => {
    const poolPlayer = findPoolPlayer(target, byId, byName)

    if (!poolPlayer) {
      unmatched.push({ playerId: target.id, name: target.name })
      return target
    }

    matched.push({ playerId: target.id, poolId: poolPlayer.id })
    const next: T = {
      ...target,
      projections: { ...poolPlayer.projections },
    }
    if (poolPlayer.teamAbbr) {
      if (!target.teamAbbr) {
        next.teamAbbr = normalizeNbaTeamAbbr(poolPlayer.teamAbbr)
      }
      if (
        typeof poolPlayer.projectedGames === "number" &&
        poolPlayer.projectedGames > 0
      ) {
        next.projectedGames = poolPlayer.projectedGames
      }
    } else {
      // Unsigned in the pool (retired / no club). Do not attach a season
      // games footprint that would pass stream-add gates while ESPN still
      // carries a stale last-team abbr.
      next.projectedGames = undefined
    }
    if (poolPlayer.shooting) {
      next.shooting = { ...poolPlayer.shooting }
    }
    next.injuryStatus = injuryStatusFromPool(poolPlayer.status)
    return next
  })

  return { players, report: { matched, unmatched } }
}
