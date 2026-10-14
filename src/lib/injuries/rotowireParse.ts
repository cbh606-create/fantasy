import type { CrosswalkRotoPlayer } from "./crosswalk"
import type { ConfirmedLineup, DepthChart, DepthPosition, InjuryUpdate } from "./selection"

const POSITIONS = new Set<DepthPosition>(["PG", "SG", "SF", "PF", "C"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const injuryStatus = (value: string): InjuryUpdate["status"] => {
  const upper = value.toUpperCase()
  if (upper === "OUT") return "out"
  if (upper === "GTD") return "gtd"
  return "other"
}

const positionOf = (value: string): DepthPosition | undefined => {
  const upper = value.trim().toUpperCase()
  return POSITIONS.has(upper as DepthPosition) ? (upper as DepthPosition) : undefined
}

export const parseInjuryUpdates = (payload: unknown): InjuryUpdate[] => {
  if (!isRecord(payload)) return []

  return list(payload.Updates).flatMap((update) => {
    const player = isRecord(update.Player) ? update.Player : {}
    const team = isRecord(update.Team) ? update.Team : {}
    const injury = isRecord(update.Injury) ? update.Injury : {}
    const rotowirePlayerId = text(player.Id)
    const at = text(update.DateTime)
    if (rotowirePlayerId.length === 0 || at.length === 0) return []

    return [
      {
        rotowirePlayerId,
        teamAbbr: text(team.Code),
        status: injuryStatus(text(injury.Status)),
        at,
      },
    ]
  })
}

export const parseDepthChart = (payload: unknown): DepthChart => {
  if (!isRecord(payload)) return { teams: [] }

  return {
    teams: list(payload.Teams).map((team) => {
      const grouped = new Map<DepthPosition, Array<{ id: string; rank: number }>>()
      for (const player of list(team.Players)) {
        const position = positionOf(text(player.Position))
        const id = text(player.Id)
        if (!position || id.length === 0) continue
        const rank = Number(player.Rank)
        const bucket = grouped.get(position) ?? []
        bucket.push({ id, rank: Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER })
        grouped.set(position, bucket)
      }

      return {
        teamAbbr: text(team.Code),
        positions: [...grouped.entries()].map(([position, players]) => ({
          position,
          playerIds: players
            .sort((left, right) => left.rank - right.rank)
            .map((player) => player.id),
        })),
      }
    }),
  }
}

const isConfirmed = (game: Record<string, unknown>): boolean =>
  game.Confirmed === true || text(game.Status).toUpperCase() === "CONFIRMED"

export const parseConfirmedLineups = (payload: unknown): ConfirmedLineup[] => {
  if (!isRecord(payload)) return []

  return list(payload.Games).flatMap((game) => {
    if (!isConfirmed(game)) return []
    const team = isRecord(game.Team) ? game.Team : {}
    const startsAt = text(game.DateTime)
    const teamAbbr = text(team.Code)
    if (startsAt.length === 0 || teamAbbr.length === 0) return []

    return [
      {
        teamAbbr,
        startsAt,
        starters: list(game.Starters).flatMap((starter) => {
          const playerId = text(starter.Id)
          if (playerId.length === 0) return []
          const position = positionOf(text(starter.Position))
          return [{ playerId, ...(position ? { position } : {}) }]
        }),
      },
    ]
  })
}

export const parseRotoPlayers = (payload: unknown): CrosswalkRotoPlayer[] => {
  if (!isRecord(payload)) return []

  const freeAgents = list(payload.FreeAgents).flatMap((player) => {
    const id = text(player.Id)
    if (id.length === 0) return []
    return [
      {
        id,
        firstName: text(player.FirstName),
        lastName: text(player.LastName),
        teamAbbr: "",
      },
    ]
  })

  const rostered = list(payload.Teams).flatMap((team) =>
    list(team.Players).flatMap((player) => {
      const id = text(player.Id)
      if (id.length === 0) return []
      return [
        {
          id,
          firstName: text(player.FirstName),
          lastName: text(player.LastName),
          teamAbbr: text(team.Code),
        },
      ]
    }),
  )

  return [...freeAgents, ...rostered]
}
