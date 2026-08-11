import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonTeamRoster,
} from "./types"

type CategoryTotals = Record<CategoryId, number>

export type CategoryLevel = {
  categoryId: CategoryId
  raw: number
  z: number
  intensity: number
  kind: "positive" | "negative" | "neutral"
}

export type TeamCategoryTotals = {
  teamIndex: number
  totals: CategoryTotals
}

export type SeasonAnalysis = {
  byTeam: {
    teamIndex: number
    levels: CategoryLevel[]
  }[]
  byCategory: {
    categoryId: CategoryId
    rows: {
      teamIndex: number
      rank: number
      z: number
      raw: number
    }[]
  }[]
}

const emptyTotals = (): CategoryTotals =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryTotals

const hasShootingVolume = (
  players: SeasonPlayer[],
  categoryId: "FG_PCT" | "FT_PCT",
) =>
  players.length > 0 &&
  players.every((player) => {
    const attempts = categoryId === "FG_PCT"
      ? player.shooting?.FGA
      : player.shooting?.FTA

    return typeof attempts === "number" && attempts > 0
  })

const percentageTotal = (
  players: SeasonPlayer[],
  categoryId: "FG_PCT" | "FT_PCT",
) => {
  if (players.length === 0) {
    return 0
  }

  if (!hasShootingVolume(players, categoryId)) {
    return players.reduce(
      (sum, player) => sum + player.projections[categoryId],
      0,
    ) / players.length
  }

  const [makesKey, attemptsKey]: [
    "FGM" | "FTM",
    "FGA" | "FTA",
  ] = categoryId === "FG_PCT"
    ? ["FGM", "FGA"]
    : ["FTM", "FTA"]
  const makes = players.reduce((sum, player) => sum + player.shooting[makesKey], 0)
  const attempts = players.reduce(
    (sum, player) => sum + player.shooting[attemptsKey],
    0,
  )

  return makes / attempts
}

export const teamTotals = (players: SeasonPlayer[]): CategoryTotals => {
  const totals = emptyTotals()

  for (const player of players) {
    for (const categoryId of ALL_CATEGORY_IDS) {
      totals[categoryId] += player.projections[categoryId]
    }
  }

  totals.FG_PCT = percentageTotal(players, "FG_PCT")
  totals.FT_PCT = percentageTotal(players, "FT_PCT")

  return totals
}

const standardDeviation = (values: number[], mean: number) =>
  Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  )

export const rosterPlayers = (
  team: SeasonTeamRoster,
  playersById: Map<string, SeasonPlayer>,
): SeasonPlayer[] =>
  team.entries.flatMap((entry) => {
    const player = entry.playerId ? playersById.get(entry.playerId) : undefined
    return player ? [player] : []
  })

export const seasonTeamTotals = (
  state: SeasonLeagueState,
): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    totals: teamTotals(rosterPlayers(team, playersById)),
  }))
}

export const analyzeTeamTotals = (
  totalsByTeam: TeamCategoryTotals[],
): SeasonAnalysis => {
  const levelsByTeam = new Map<number, CategoryLevel[]>()
  const byCategory = ALL_CATEGORY_IDS.map((categoryId) => {
    const values = totalsByTeam.map(({ totals }) => totals[categoryId])
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const deviation = standardDeviation(values, mean)
    const rows = totalsByTeam
      .map(({ teamIndex, totals }) => {
        const difference = totals[categoryId] - mean
        const z = deviation === 0
          ? 0
          : (categoryId === "TO" ? -difference : difference) / deviation
        const kind = z > 0 ? "positive" : z < 0 ? "negative" : "neutral"
        const levels = levelsByTeam.get(teamIndex) ?? []

        levels.push({
          categoryId,
          raw: totals[categoryId],
          z,
          intensity: Math.abs(z),
          kind,
        })
        levelsByTeam.set(teamIndex, levels)

        return { teamIndex, z, raw: totals[categoryId] }
      })
      .sort((left, right) => {
        const difference = categoryId === "TO"
          ? left.raw - right.raw
          : right.raw - left.raw

        return difference || left.teamIndex - right.teamIndex
      })
      .map((row, index) => ({ ...row, rank: index + 1 }))

    return { categoryId, rows }
  })

  return {
    byTeam: totalsByTeam.map(({ teamIndex }) => ({
      teamIndex,
      levels: levelsByTeam.get(teamIndex) ?? [],
    })),
    byCategory,
  }
}

export const analyzeSeasonLeague = (
  state: SeasonLeagueState,
): SeasonAnalysis => analyzeTeamTotals(seasonTeamTotals(state))
