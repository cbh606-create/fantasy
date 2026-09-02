import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { MAX_STREAMERS, MIN_STREAMER_GAMES } from "./constants"
import type { MatchupBoard, StreamerSuggestion, WinnerStreamRecipe } from "./types"
import { weeklyPlayerStats } from "./weekly"
import { winnerPriorHits } from "./winnerStreamPrior"

const STREAMER_COUNTING_CATEGORIES: CategoryId[] = [
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "PTS",
  "TO",
]

type SuggestStreamersInput = {
  state: SeasonLeagueState
  board: MatchupBoard
  gamesMap: Map<string, number>
  b2bMap?: Map<string, number>
  recipes?: WinnerStreamRecipe[]
}

const weakCategories = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.outcome === "L" || row.outcome === "T")
    .map((row) => row.categoryId)

const categoryContribution = (
  player: SeasonPlayer,
  games: number,
  categoryId: CategoryId,
): number => {
  const weekly = weeklyPlayerStats(player, games)
  const value = weekly.projections[categoryId]
  return categoryId === "TO" ? -value : value
}

const streamerScore = (
  player: SeasonPlayer,
  games: number,
  weakCats: CategoryId[],
): number =>
  weakCats.reduce((sum, categoryId) => {
    if (!STREAMER_COUNTING_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, games, categoryId)
  }, 0)

const helpedCategories = (
  player: SeasonPlayer,
  games: number,
  weakCats: CategoryId[],
): CategoryId[] =>
  weakCats
    .filter((categoryId) => STREAMER_COUNTING_CATEGORIES.includes(categoryId))
    .map((categoryId) => ({
      categoryId,
      contribution: categoryContribution(player, games, categoryId),
    }))
    .filter(({ contribution }) => contribution > 0)
    .sort((left, right) => right.contribution - left.contribution)
    .map(({ categoryId }) => categoryId)

export const formatStreamerGamesLabel = (
  games: number,
  b2bNights: number,
): string => {
  const gameDays = Number.isInteger(games) ? games : Math.round(games)
  if (b2bNights <= 0) return `${gameDays} games`
  if (b2bNights === 1) return `${gameDays} games · 1 B2B`
  return `${gameDays} games · ${b2bNights} B2B`
}

const buildReasons = (
  helped: CategoryId[],
  games: number,
  b2bNights: number,
): string[] => {
  const gamesLabel = formatStreamerGamesLabel(games, b2bNights)
  if (helped.length === 0) return [gamesLabel]
  return [`Helps ${helped[0]} · ${gamesLabel}`]
}

export const suggestStreamers = ({
  state,
  board,
  gamesMap,
  b2bMap = new Map(),
  recipes = [],
}: SuggestStreamersInput): StreamerSuggestion[] => {
  const weakCats = weakCategories(board)
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const rankHits = (playerId: string) => {
    const player = playersById.get(playerId)
    if (!player) return 0
    return winnerPriorHits(player, board, recipes)
  }

  const compareSuggestions = (
    left: StreamerSuggestion,
    right: StreamerSuggestion,
  ) => {
    if (right.score !== left.score) return right.score - left.score
    if (right.gamesThisWeek !== left.gamesThisWeek) {
      return right.gamesThisWeek - left.gamesThisWeek
    }
    const hitDelta = rankHits(right.playerId) - rankHits(left.playerId)
    if (hitDelta !== 0) return hitDelta
    return left.playerId.localeCompare(right.playerId)
  }

  const buildCandidates = (minGames: number): StreamerSuggestion[] =>
    state.availablePlayerIds
      .flatMap((playerId) => {
        const player = playersById.get(playerId)
        if (!player) return []

        const gamesThisWeek = gamesMap.get(playerId) ?? 0
        if (gamesThisWeek < minGames) return []

        const b2bNights = b2bMap.get(playerId) ?? 0
        const score = streamerScore(player, gamesThisWeek, weakCats)
        const helped = helpedCategories(player, gamesThisWeek, weakCats)

        return [
          {
            playerId,
            score,
            gamesThisWeek,
            b2bNights,
            reasons: buildReasons(helped, gamesThisWeek, b2bNights),
          },
        ]
      })
      .sort(compareSuggestions)

  let candidates = buildCandidates(MIN_STREAMER_GAMES)

  if (candidates.length < MAX_STREAMERS) {
    const relaxed = buildCandidates(1)
    const seen = new Set(candidates.map((candidate) => candidate.playerId))

    for (const candidate of relaxed) {
      if (seen.has(candidate.playerId)) continue
      candidates.push(candidate)
      seen.add(candidate.playerId)
    }

    candidates = candidates
      .sort(compareSuggestions)
      .slice(0, MAX_STREAMERS)
  } else {
    candidates = candidates.slice(0, MAX_STREAMERS)
  }

  return candidates
}
