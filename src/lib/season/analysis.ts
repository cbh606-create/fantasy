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

export type StatBasis = "total" | "perGame"
export type FormWindow = "season" | "l7" | "l15" | "l30"

const FORM_WINDOW_GAMES: Record<Exclude<FormWindow, "season">, number> = {
  l7: 7,
  l15: 15,
  l30: 30,
}

type PlayerLine = {
  projections: SeasonPlayer["projections"]
  shooting: SeasonPlayer["shooting"]
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

const aggregateLines = (lines: PlayerLine[]): CategoryTotals => {
  const totals = emptyTotals()

  for (const line of lines) {
    for (const categoryId of COUNTING_CATEGORY_IDS) {
      totals[categoryId] += line.projections[categoryId]
    }
  }

  const rate = (
    makesKey: "FGM" | "FTM",
    attemptsKey: "FGA" | "FTA",
    categoryId: "FG_PCT" | "FT_PCT",
  ) => {
    if (lines.length === 0) return 0
    if (lines.every((line) => line.shooting[attemptsKey] > 0)) {
      const makes = lines.reduce((sum, line) => sum + line.shooting[makesKey], 0)
      const attempts = lines.reduce(
        (sum, line) => sum + line.shooting[attemptsKey],
        0,
      )
      return makes / attempts
    }

    return (
      lines.reduce((sum, line) => sum + line.projections[categoryId], 0) /
      lines.length
    )
  }

  totals.FG_PCT = rate("FGM", "FGA", "FG_PCT")
  totals.FT_PCT = rate("FTM", "FTA", "FT_PCT")

  return totals
}

export const teamTotalsForBasis = (
  players: SeasonPlayer[],
  basis: StatBasis,
  window: FormWindow = "season",
): CategoryTotals => {
  const lines = players.map((player) => playerLineForBasis(player, basis, window))
  const totals = aggregateLines(lines)
  if (basis !== "perGame") return totals

  const rateLines = aggregateLines(
    players.map((player) => playerLineForBasis(player, "total", window)),
  )
  totals.FG_PCT = rateLines.FG_PCT
  totals.FT_PCT = rateLines.FT_PCT
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

const seasonGameCount = (player: SeasonPlayer): number => {
  if (typeof player.projectedGames === "number" && player.projectedGames > 0) {
    return player.projectedGames
  }

  return ASSUMED_SEASON_GAMES
}

const scaleLine = (line: PlayerLine, factor: number): PlayerLine => {
  const projections = { ...line.projections }
  const shooting = {
    FGM: line.shooting.FGM * factor,
    FGA: line.shooting.FGA * factor,
    FTM: line.shooting.FTM * factor,
    FTA: line.shooting.FTA * factor,
  }

  for (const categoryId of COUNTING_CATEGORY_IDS) {
    projections[categoryId] = line.projections[categoryId] * factor
  }

  projections.FG_PCT = shooting.FGA > 0
    ? shooting.FGM / shooting.FGA
    : line.projections.FG_PCT
  projections.FT_PCT = shooting.FTA > 0
    ? shooting.FTM / shooting.FTA
    : line.projections.FT_PCT

  return { projections, shooting }
}

const storedProjectionPerGame = (player: SeasonPlayer): PlayerLine =>
  scaleLine(
    { projections: player.projections, shooting: player.shooting },
    1 / gamesForPerGameRate(player),
  )

const blendedSeasonTotal = (player: SeasonPlayer): PlayerLine => {
  const played = player.seasonRates?.gamesPlayed ?? 0

  if (!player.seasonRates || played <= 0) {
    return { projections: player.projections, shooting: player.shooting }
  }

  const seasonGames = seasonGameCount(player)
  const projected = storedProjectionPerGame(player)
  const remaining = Math.max(0, seasonGames - played)
  const actual = player.seasonRates
  const projections = { ...projected.projections }
  const shooting = {
    FGM: actual.shooting.FGM * played + projected.shooting.FGM * remaining,
    FGA: actual.shooting.FGA * played + projected.shooting.FGA * remaining,
    FTM: actual.shooting.FTM * played + projected.shooting.FTM * remaining,
    FTA: actual.shooting.FTA * played + projected.shooting.FTA * remaining,
  }

  for (const categoryId of COUNTING_CATEGORY_IDS) {
    projections[categoryId] =
      actual.projections[categoryId] * played +
      projected.projections[categoryId] * remaining
  }

  projections.FG_PCT = shooting.FGA > 0
    ? shooting.FGM / shooting.FGA
    : actual.projections.FG_PCT
  projections.FT_PCT = shooting.FTA > 0
    ? shooting.FTM / shooting.FTA
    : actual.projections.FT_PCT

  return { projections, shooting }
}

const seasonPerGame = (player: SeasonPlayer): PlayerLine => {
  const played = player.seasonRates?.gamesPlayed ?? 0
  const divisor = !player.seasonRates || played <= 0
    ? gamesForPerGameRate(player)
    : seasonGameCount(player)

  return scaleLine(blendedSeasonTotal(player), 1 / divisor)
}

const recentPerGame = (
  player: SeasonPlayer,
  window: Exclude<FormWindow, "season">,
): PlayerLine => {
  const rates = player.recentRates?.[window]
  if (!rates) {
    return seasonPerGame(player)
  }

  return {
    projections: { ...rates.projections },
    shooting: { ...rates.shooting },
  }
}

export const playerLineForBasis = (
  player: SeasonPlayer,
  basis: StatBasis,
  window: FormWindow = "season",
): PlayerLine => {
  if (window === "season") {
    if (basis === "total") return blendedSeasonTotal(player)
    return seasonPerGame(player)
  }

  const perGame = recentPerGame(player, window)
  if (basis === "perGame") return perGame
  return scaleLine(perGame, FORM_WINDOW_GAMES[window])
}

export const formTeamTotals = (
  state: SeasonLeagueState,
  window: FormWindow,
  basis: StatBasis,
): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    totals: teamTotalsForBasis(rosterPlayers(team, playersById), basis, window),
  }))
}

export const seasonTeamTotals = (
  state: SeasonLeagueState,
): TeamCategoryTotals[] => formTeamTotals(state, "season", "total")

export const perGameTeamTotals = (
  state: SeasonLeagueState,
): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    totals: teamTotalsForBasis(rosterPlayers(team, playersById), "perGame"),
  }))
}

export const leagueTotalsForBasis = (
  state: SeasonLeagueState,
  basis: StatBasis,
): TeamCategoryTotals[] =>
  basis === "perGame" ? perGameTeamTotals(state) : seasonTeamTotals(state)

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

export const analyzeFormLeague = (
  state: SeasonLeagueState,
  window: FormWindow,
  basis: StatBasis,
): SeasonAnalysis => analyzeTeamTotals(formTeamTotals(state, window, basis))

export const analyzeSeasonLeague = (
  state: SeasonLeagueState,
): SeasonAnalysis => analyzeFormLeague(state, "season", "total")
