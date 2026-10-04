import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { ASSUMED_SEASON_GAMES } from "@/lib/matchup/constants"
import { rosterPlayers, type TeamCategoryTotals } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const COUNTING_IDS: CategoryId[] = ["TPM", "REB", "AST", "STL", "BLK", "TO", "PTS"]

const emptyTotals = (): Record<CategoryId, number> =>
  Object.fromEntries(ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0])) as Record<CategoryId, number>

const projectedGamesFor = (player: SeasonPlayer) =>
  typeof player.projectedGames === "number" && player.projectedGames > 0
    ? player.projectedGames
    : ASSUMED_SEASON_GAMES

const hasShootingVolume = (
  players: SeasonPlayer[],
  categoryId: "FG_PCT" | "FT_PCT",
) =>
  players.length > 0 &&
  players.every((player) => {
    const attempts = categoryId === "FG_PCT" ? player.shooting?.FGA : player.shooting?.FTA
    return typeof attempts === "number" && attempts > 0
  })

const percentageLine = (
  players: SeasonPlayer[],
  categoryId: "FG_PCT" | "FT_PCT",
) => {
  if (players.length === 0) return 0
  if (!hasShootingVolume(players, categoryId)) {
    return players.reduce((sum, player) => sum + player.projections[categoryId], 0) / players.length
  }

  const makesKey = categoryId === "FG_PCT" ? "FGM" : "FTM"
  const attemptsKey = categoryId === "FG_PCT" ? "FGA" : "FTA"
  const makes = players.reduce(
    (sum, player) => sum + player.shooting[makesKey] / projectedGamesFor(player),
    0,
  )
  const attempts = players.reduce(
    (sum, player) => sum + player.shooting[attemptsKey] / projectedGamesFor(player),
    0,
  )

  return attempts === 0 ? 0 : makes / attempts
}

export const perGameTotals = (players: SeasonPlayer[]): Record<CategoryId, number> => {
  const totals = emptyTotals()

  for (const player of players) {
    const games = projectedGamesFor(player)
    for (const categoryId of COUNTING_IDS) {
      totals[categoryId] += player.projections[categoryId] / games
    }
  }

  totals.FG_PCT = percentageLine(players, "FG_PCT")
  totals.FT_PCT = percentageLine(players, "FT_PCT")

  return totals
}

export const perGameTeamLines = (state: SeasonLeagueState): TeamCategoryTotals[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  return state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    totals: perGameTotals(rosterPlayers(team, playersById)),
  }))
}
