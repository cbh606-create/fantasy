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

const percentageLine = (
  players: SeasonPlayer[],
  categoryId: "FG_PCT" | "FT_PCT",
) => {
  if (players.length === 0) return 0

  const makesKey = categoryId === "FG_PCT" ? "FGM" : "FTM"
  const attemptsKey = categoryId === "FG_PCT" ? "FGA" : "FTA"
  const makes = players.reduce((sum, player) => sum + (player.shooting?.[makesKey] ?? 0), 0)
  const attempts = players.reduce((sum, player) => sum + (player.shooting?.[attemptsKey] ?? 0), 0)

  if (attempts === 0) {
    return players.reduce((sum, player) => sum + player.projections[categoryId], 0) / players.length
  }

  return makes / attempts
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
