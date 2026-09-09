import type { CategoryId } from "@/lib/domain/types"
import { normalizePlayerName } from "@/lib/players/hashtagImport"

export type PoolProjectionPlayer = {
  id: string
  name: string
  espnId?: string
  teamAbbr?: string
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

export const applyPoolProjections = <T extends SeasonProjectionTarget>(
  targets: T[],
  poolPlayers: PoolProjectionPlayer[],
): { players: T[]; report: ApplyPoolProjectionsReport } => {
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

  const matched: ApplyPoolProjectionsReport["matched"] = []
  const unmatched: ApplyPoolProjectionsReport["unmatched"] = []

  const players = targets.map((target) => {
    let poolPlayer: PoolProjectionPlayer | undefined
    for (const key of idKeysFor(target)) {
      poolPlayer = byId.get(key)
      if (poolPlayer) break
    }

    if (!poolPlayer) {
      const nameMatches = byName.get(normalizePlayerName(target.name)) ?? []
      if (nameMatches.length === 1) {
        poolPlayer = nameMatches[0]
      } else if (nameMatches.length > 1 && target.teamAbbr) {
        poolPlayer = nameMatches.find(
          (candidate) => candidate.teamAbbr === target.teamAbbr,
        )
      }
    }

    if (!poolPlayer) {
      unmatched.push({ playerId: target.id, name: target.name })
      return target
    }

    matched.push({ playerId: target.id, poolId: poolPlayer.id })
    const next: T = {
      ...target,
      projections: { ...poolPlayer.projections },
    }
    if (
      typeof poolPlayer.projectedGames === "number" &&
      poolPlayer.projectedGames > 0
    ) {
      next.projectedGames = poolPlayer.projectedGames
    }
    if (poolPlayer.shooting) {
      next.shooting = { ...poolPlayer.shooting }
    }
    return next
  })

  return { players, report: { matched, unmatched } }
}
