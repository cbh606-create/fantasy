import type { CategoryId } from "@/lib/domain/types"
import type { ScheduleResponse, SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { WEEKLY_ADD_LIMIT } from "./constants"
import type {
  MatchupBoard,
  StreamingPlan,
  StreamingPlanAction,
  StreamingPlanDay,
  StreamingPlanDayCell,
  StreamingPlanSpotCount,
} from "./types"
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

export type BuildStreamingPlanInput = {
  spotCount: StreamingPlanSpotCount
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  addLimit?: number
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

const weakCatScore = (player: SeasonPlayer, weakCats: CategoryId[]): number =>
  weakCats.reduce((sum, categoryId) => {
    if (!STREAMER_COUNTING_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, 1, categoryId)
  }, 0)

const playsOn = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
): boolean => {
  const team = player.teamAbbr?.toUpperCase()
  if (!team) return false
  return schedule.games.some((game) => {
    if (game.date !== date) return false
    const home = game.homeAbbr.toUpperCase()
    const away = game.awayAbbr.toUpperCase()
    return home === team || away === team
  })
}

const pickBestFa = (
  candidates: SeasonPlayer[],
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  seatedIds: Set<string>,
): SeasonPlayer | null => {
  const eligible = candidates
    .filter((player) => !seatedIds.has(player.id))
    .filter((player) => playsOn(player, date, schedule))
    .map((player) => ({
      player,
      score: weakCatScore(player, weakCats),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.player.id.localeCompare(right.player.id)
    })

  return eligible[0]?.player ?? null
}

export const buildStreamingPlan = ({
  spotCount,
  state,
  schedule,
  board,
  addLimit = WEEKLY_ADD_LIMIT,
}: BuildStreamingPlanInput): StreamingPlan => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const freeAgents = state.availablePlayerIds
    .map((id) => playersById.get(id))
    .filter((player): player is SeasonPlayer => Boolean(player?.teamAbbr))

  const weakCats = weakCategories(board)
  const occupants: (string | null)[] = Array.from({ length: spotCount }, () => null)
  let addsUsed = 0
  let gameStarts = 0
  const days: StreamingPlanDay[] = []

  for (const date of schedule.matchup.days) {
    const cells: StreamingPlanDayCell[] = []
    const seatedToday = new Set<string>()

    // Pass 1: hold players who play; free spots whose occupant has no game
    const afterDrop: (string | null)[] = occupants.map((playerId) => {
      if (!playerId) return null
      const player = playersById.get(playerId)
      if (!player) return null
      if (playsOn(player, date, schedule)) return playerId
      return null
    })

    // Pass 2: fill spots
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
      const previousId = occupants[spotIndex]
      const heldId = afterDrop[spotIndex]

      let playerId: string | null = null
      let action: StreamingPlanAction = "empty"

      if (heldId) {
        playerId = heldId
        action = "hold"
        seatedToday.add(heldId)
      } else if (addsUsed < addLimit) {
        const best = pickBestFa(freeAgents, date, schedule, weakCats, seatedToday)
        if (best) {
          playerId = best.id
          action = previousId ? "drop_add" : "add"
          addsUsed += 1
          seatedToday.add(best.id)
        } else {
          action = "empty"
        }
      } else {
        action = "empty"
      }

      occupants[spotIndex] = playerId
      cells.push({ spotIndex, playerId, action })

      if (playerId) {
        const player = playersById.get(playerId)
        if (player && playsOn(player, date, schedule)) gameStarts += 1
      }
    }

    days.push({ date, cells })
  }

  return {
    spotCount,
    addLimit,
    addsUsed,
    gameStarts,
    days,
  }
}
