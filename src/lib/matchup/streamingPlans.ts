import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import { WEEKLY_ADD_LIMIT } from "./constants"
import type {
  MatchupBoard,
  StreamingPlan,
  StreamingPlanAction,
  StreamingPlanDay,
  StreamingPlanDayCell,
  StreamingPlanRosterDropKind,
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

const remainingGameDays = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
): number => {
  const remaining = schedule.matchup.days.filter((day) => day >= fromDate)
  return remaining.filter((day) => playsOn(player, day, schedule)).length
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
      volume: remainingGameDays(player, date, schedule),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (right.volume !== left.volume) return right.volume - left.volume
      return left.player.id.localeCompare(right.player.id)
    })

  return eligible[0]?.player ?? null
}

const isIlSlot = (slot: SeasonRosterEntry["slot"]) => slot === "IL"

const hasOpenNonIlSlot = (entries: SeasonRosterEntry[]) =>
  entries.some((entry) => !isIlSlot(entry.slot) && entry.playerId === null)

const weakCatScoreForGames = (
  player: SeasonPlayer,
  games: number,
  weakCats: CategoryId[],
) =>
  weakCats.reduce((sum, categoryId) => {
    if (!STREAMER_COUNTING_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, games, categoryId)
  }, 0)

const pickRosterDrop = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  alreadyDropped: Set<string>,
): { kind: StreamingPlanRosterDropKind; playerId: string | null } => {
  if (hasOpenNonIlSlot(entries)) {
    return { kind: "open_slot", playerId: null }
  }

  const candidates = entries
    .filter((entry) => !isIlSlot(entry.slot) && entry.playerId)
    .map((entry) => playersById.get(entry.playerId!))
    .filter((p): p is SeasonPlayer => Boolean(p))
    .filter((p) => !alreadyDropped.has(p.id))
    .map((p) => ({
      player: p,
      noGame: playsOn(p, date, schedule) ? 0 : 1,
      volume: remainingGameDays(p, date, schedule),
      weak: weakCatScoreForGames(p, 1, weakCats),
    }))
    .sort((left, right) => {
      if (right.noGame !== left.noGame) return right.noGame - left.noGame
      if (left.volume !== right.volume) return left.volume - right.volume
      if (left.weak !== right.weak) return left.weak - right.weak
      return left.player.id.localeCompare(right.player.id)
    })

  const best = candidates[0]
  if (!best) return { kind: "none", playerId: null }
  return { kind: "player", playerId: best.player.id }
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
    const rosterDroppedToday = new Set<string>()

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
      let droppedPlayerId: string | null = null
      let rosterDropKind: StreamingPlanRosterDropKind = "none"
      let rosterDropPlayerId: string | null = null

      if (heldId) {
        playerId = heldId
        action = "hold"
        seatedToday.add(heldId)
      } else if (addsUsed < addLimit) {
        const best = pickBestFa(freeAgents, date, schedule, weakCats, seatedToday)
        if (best) {
          playerId = best.id
          if (previousId) {
            action = "drop_add"
            droppedPlayerId = previousId
          } else {
            action = "add"
          }
          addsUsed += 1
          seatedToday.add(best.id)
        } else {
          action = "empty"
        }
      } else {
        action = "empty"
      }

      if (action === "add" || action === "drop_add") {
        const rosterDrop = pickRosterDrop(
          state.teams[state.perspectiveTeamIndex]!.entries,
          playersById,
          date,
          schedule,
          weakCats,
          rosterDroppedToday,
        )
        rosterDropKind = rosterDrop.kind
        rosterDropPlayerId = rosterDrop.playerId
        if (rosterDrop.kind === "player" && rosterDrop.playerId) {
          rosterDroppedToday.add(rosterDrop.playerId)
        }
      }

      occupants[spotIndex] = playerId
      cells.push({
        spotIndex,
        playerId,
        action,
        droppedPlayerId,
        rosterDropPlayerId,
        rosterDropKind,
      })

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

export const buildAllStreamingPlans = (
  input: Omit<BuildStreamingPlanInput, "spotCount">,
): StreamingPlan[] =>
  ([1, 2, 3] as const).map((spotCount) =>
    buildStreamingPlan({ ...input, spotCount }),
  )
