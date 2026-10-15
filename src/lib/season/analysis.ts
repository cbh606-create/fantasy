import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { capnightPlayerZ } from "@/lib/players/capnightZ"
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
  /** Roto-style overall: sum of category ranks (lower better), then place. */
  overall: {
    rows: {
      teamIndex: number
      rank: number
      rankSum: number
    }[]
  }
}

const COUNTING_CATEGORY_IDS = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)
const PER_GAME_PTS_CEILING = 50
const ASSUMED_SEASON_GAMES = 82

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
    if (entry.slot === "IL" || !entry.playerId) return []
    const player = playersById.get(entry.playerId)
    return player ? [player] : []
  })

const gamesForPerGameRate = (player: SeasonPlayer): number => {
  if (typeof player.projectedGames === "number" && player.projectedGames > 0) {
    return player.projectedGames
  }

  if (
    player.projections.PTS > 0 &&
    player.projections.PTS < PER_GAME_PTS_CEILING
  ) {
    return 1
  }

  return ASSUMED_SEASON_GAMES
}

export const seasonTeamTotals = (
  state: SeasonLeagueState,
): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    totals: teamTotals(rosterPlayers(team, playersById)),
  }))
}

export const playerLineForBasis = (
  player: SeasonPlayer,
  basis: "total" | "perGame",
): { projections: SeasonPlayer["projections"]; shooting: SeasonPlayer["shooting"] } => {
  if (basis === "total") {
    return { projections: player.projections, shooting: player.shooting }
  }

  const games = gamesForPerGameRate(player)
  const projections = { ...player.projections }

  for (const categoryId of COUNTING_CATEGORY_IDS) {
    projections[categoryId] = player.projections[categoryId] / games
  }

  return {
    projections,
    shooting: {
      FGM: player.shooting.FGM / games,
      FGA: player.shooting.FGA / games,
      FTM: player.shooting.FTM / games,
      FTA: player.shooting.FTA / games,
    },
  }
}

export const perGameTeamTotals = (
  state: SeasonLeagueState,
): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => {
    const players = rosterPlayers(team, playersById)
    const totals = emptyTotals()

    for (const player of players) {
      const games = gamesForPerGameRate(player)

      for (const categoryId of COUNTING_CATEGORY_IDS) {
        totals[categoryId] += player.projections[categoryId] / games
      }
    }

    totals.FG_PCT = percentageTotal(players, "FG_PCT")
    totals.FT_PCT = percentageTotal(players, "FT_PCT")

    return { teamIndex: team.teamIndex, totals }
  })
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

  const rankSumByTeam = new Map<number, number>()
  for (const category of byCategory) {
    for (const row of category.rows) {
      rankSumByTeam.set(
        row.teamIndex,
        (rankSumByTeam.get(row.teamIndex) ?? 0) + row.rank,
      )
    }
  }
  const overall = {
    rows: [...rankSumByTeam.entries()]
      .map(([teamIndex, rankSum]) => ({ teamIndex, rankSum }))
      .sort((left, right) =>
        left.rankSum - right.rankSum || left.teamIndex - right.teamIndex)
      .map((row, index) => ({ ...row, rank: index + 1 })),
  }

  return {
    byTeam: totalsByTeam.map(({ teamIndex }) => ({
      teamIndex,
      levels: levelsByTeam.get(teamIndex) ?? [],
    })),
    byCategory,
    overall,
  }
}

export const analyzePerGameLeague = (
  state: SeasonLeagueState,
): SeasonAnalysis => analyzeTeamTotals(perGameTeamTotals(state))

export const analyzeSeasonLeague = (
  state: SeasonLeagueState,
): SeasonAnalysis => {
  const analysis = analyzeTeamTotals(seasonTeamTotals(state))
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const zByTeam = new Map<number, Record<CategoryId, number>>()

  for (const team of state.teams) {
    const totals = Object.fromEntries(
      ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
    ) as Record<CategoryId, number>

    for (const player of rosterPlayers(team, playersById)) {
      const categories = capnightPlayerZ(player.name).z
      for (const categoryId of ALL_CATEGORY_IDS) {
        totals[categoryId] += categories[categoryId]
      }
    }

    zByTeam.set(team.teamIndex, totals)
  }

  const leagueZByCategory = new Map(
    ALL_CATEGORY_IDS.map((categoryId) => {
      const values = state.teams.map(
        (team) => zByTeam.get(team.teamIndex)?.[categoryId] ?? 0,
      )
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const deviation = standardDeviation(values, mean)

      return [
        categoryId,
        new Map(
          state.teams.map((team, index) => {
            const value = values[index] ?? 0
            const z = deviation === 0 ? 0 : (value - mean) / deviation
            return [team.teamIndex, z]
          }),
        ),
      ] as const
    }),
  )
  const zFor = (teamIndex: number, categoryId: CategoryId) =>
    leagueZByCategory.get(categoryId)?.get(teamIndex) ?? 0

  return {
    byTeam: analysis.byTeam.map((team) => ({
      ...team,
      levels: team.levels.map((level) => {
        const z = zFor(team.teamIndex, level.categoryId)
        const kind = z > 0 ? "positive" : z < 0 ? "negative" : "neutral"

        return { ...level, z, intensity: Math.abs(z), kind }
      }),
    })),
    byCategory: analysis.byCategory.map((category) => ({
      ...category,
      rows: category.rows.map((row) => ({
        ...row,
        z: zFor(row.teamIndex, category.categoryId),
      })),
    })),
    overall: analysis.overall,
  }
}
