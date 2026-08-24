import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { MAX_STREAMERS, MIN_STREAMER_GAMES } from "./constants"
import type { MatchupBoard, StreamerSuggestion } from "./types"
import { weeklyPlayerStats } from "./weekly"

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

const buildReasons = (
  helped: CategoryId[],
  games: number,
): string[] => {
  if (helped.length === 0) {
    return [`${games} games`]
  }

  return [`Helps ${helped[0]} · ${games} games`]
}

export const suggestStreamers = ({
  state,
  board,
  gamesMap,
}: SuggestStreamersInput): StreamerSuggestion[] => {
  const weakCats = weakCategories(board)
  const playersById = new Map(state.players.map((player) => [player.id, player]))

  const buildCandidates = (minGames: number): StreamerSuggestion[] =>
    state.availablePlayerIds
      .flatMap((playerId) => {
        const player = playersById.get(playerId)
        if (!player) return []

        const gamesThisWeek = gamesMap.get(playerId) ?? 0
        if (gamesThisWeek < minGames) return []

        const score = streamerScore(player, gamesThisWeek, weakCats)
        const helped = helpedCategories(player, gamesThisWeek, weakCats)

        return [
          {
            playerId,
            score,
            gamesThisWeek,
            reasons: buildReasons(helped, gamesThisWeek),
          },
        ]
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        if (right.gamesThisWeek !== left.gamesThisWeek) {
          return right.gamesThisWeek - left.gamesThisWeek
        }
        return left.playerId.localeCompare(right.playerId)
      })

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
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        if (right.gamesThisWeek !== left.gamesThisWeek) {
          return right.gamesThisWeek - left.gamesThisWeek
        }
        return left.playerId.localeCompare(right.playerId)
      })
      .slice(0, MAX_STREAMERS)
  } else {
    candidates = candidates.slice(0, MAX_STREAMERS)
  }

  return candidates
}
