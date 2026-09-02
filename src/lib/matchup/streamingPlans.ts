import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { WEEKLY_ADD_LIMIT } from "./constants"
import {
  initDailyLineups,
  isDailyLineupFullForDate,
  type DailyLineups,
  youTotalsFromDaily,
} from "./dailyLineups"
import { rosterSlotsFor } from "./eligibility"
import {
  categoryIdsFromBoard,
  oppTotalsFromBoard,
  pickBestStreamerMove,
  type StreamerMoveDrop,
} from "./streamerMove"
import { targetCategoryIdsFromBoards } from "./streamingDropExplain"
import type {
  MatchupBoard,
  StreamingPlan,
  StreamingPlanAction,
  StreamingPlanDay,
  StreamingPlanDayCell,
  StreamingPlanRosterDropKind,
  StreamingPlanSpotCount,
  StreamingStrategyMode,
  WinnerStreamRecipe,
} from "./types"
import {
  blockFromDate,
  findStreamingBlocks,
  type StreamingBlock,
} from "./streamingBlocks"
import {
  chooseIlVersusNewInjuredDrop,
  isAdpProtected,
  isLongTermInjuryException,
  isUnderperformingDropException,
} from "./streamingDropPolicy"
import {
  allowsAddForTier,
  allowsEarlySwap,
  allowsMultiSpotEarlySwap,
  allowsMultiSpotOffNightUpgrade,
  allowsThinFill,
  dailySwapPaceLimit,
  densityTierRank,
  isAddBudgetBehind,
  normalizeStreamingStrategyMode,
  suggestStreamingStrategyMode,
} from "./streamingStrategy"
import { weeklyPlayerStats } from "./weekly"
import {
  isOnWaiverCooldown,
  resolveWaiverPeriodDays,
} from "./streamingWaiver"

const PRIMARY_STREAMER_CATEGORIES: CategoryId[] = [
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "PTS",
]

/** Soft tie-breakers after volume / stretch / primary weak cats. */
const SOFT_STREAMER_CATEGORIES: CategoryId[] = ["FG_PCT", "FT_PCT", "TO"]

const STREAMER_COUNTING_CATEGORIES: CategoryId[] = [
  ...PRIMARY_STREAMER_CATEGORIES,
  "TO",
]

export type BuildStreamingPlanInput = {
  spotCount: StreamingPlanSpotCount
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  addLimit?: number
  strategyMode?: StreamingStrategyMode
  adpByPlayerId?: Record<string, number>
  injuryOutDaysByPlayerId?: Record<string, number>
  forcedRosterDrops?: Record<string, string | "open_slot" | "hold">
  /** When set, skip add spends on dates whose Daily active lineup is already full. */
  daily?: DailyLineups
  /** Overrides `state.waiverPeriodDays`. Default 2 matchup days. */
  waiverPeriodDays?: number
  winnerStreamRecipes?: WinnerStreamRecipe[]
  today?: string
}

export const streamingAddDropKey = (date: string, spotIndex: number) =>
  `${date}:${spotIndex}`

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
    if (!PRIMARY_STREAMER_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, 1, categoryId)
  }, 0)

/** FG%/FT%/TO when those cats are L/T — never overrides volume/stretch/primary. */
const softStreamerScore = (
  player: SeasonPlayer,
  weakCats: CategoryId[],
): number =>
  weakCats.reduce((sum, categoryId) => {
    if (!SOFT_STREAMER_CATEGORIES.includes(categoryId)) return sum
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

/** Games inside the next `windowDays` matchup days starting at fromDate. */
const nearTermStretch = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
  windowDays = 4,
): number => {
  const window = schedule.matchup.days
    .filter((day) => day >= fromDate)
    .slice(0, windowDays)
  return window.filter((day) => playsOn(player, day, schedule)).length
}

type StreamPosFamily = "guard" | "wing" | "big"

const streamPositionFamily = (
  player: SeasonPlayer | undefined,
): StreamPosFamily | null => {
  const positions = player?.positions ?? []
  if (positions.length === 0) return null
  if (positions.some((slot) => slot === "C" || slot === "PF")) return "big"
  if (positions.some((slot) => slot === "PG" || slot === "SG" || slot === "G")) {
    return "guard"
  }
  return "wing"
}

/** Alternatives should feel like the same stream archetype (not C-block vs 3PT guard). */
const isCompatibleStreamerAlternative = (
  chosen: SeasonPlayer,
  candidate: SeasonPlayer,
): boolean => {
  const chosenFamily = streamPositionFamily(chosen)
  const candidateFamily = streamPositionFamily(candidate)
  if (chosenFamily && candidateFamily && chosenFamily !== candidateFamily) {
    return false
  }
  return true
}

const rankEligibleFas = (
  candidates: SeasonPlayer[],
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  seatedIds: Set<string>,
): SeasonPlayer[] => {
  const eligible = candidates
    .filter((player) => !seatedIds.has(player.id))
    .filter((player) => playsOn(player, date, schedule))
    .map((player) => ({
      player,
      // Prefer leftover starts first so one add covers more games.
      volume: remainingGameDays(player, date, schedule),
      stretch: nearTermStretch(player, date, schedule),
      score: weakCatScore(player, weakCats),
      soft: softStreamerScore(player, weakCats),
    }))
    .filter((entry) => entry.volume > 0)
    .sort((left, right) => {
      if (right.volume !== left.volume) return right.volume - left.volume
      if (right.stretch !== left.stretch) return right.stretch - left.stretch
      if (right.score !== left.score) return right.score - left.score
      if (right.soft !== left.soft) return right.soft - left.soft
      return left.player.id.localeCompare(right.player.id)
    })

  return eligible.map((entry) => entry.player)
}

const compareBlocks = (
  left: StreamingBlock,
  right: StreamingBlock,
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
): number => {
  if (right.remainingWeekGames !== left.remainingWeekGames) {
    return right.remainingWeekGames - left.remainingWeekGames
  }
  const tierDelta = densityTierRank(right.tier) - densityTierRank(left.tier)
  if (tierDelta !== 0) return tierDelta
  const leftPlayer = playersById.get(left.playerId)
  const rightPlayer = playersById.get(right.playerId)
  const leftScore = leftPlayer ? weakCatScore(leftPlayer, weakCats) : 0
  const rightScore = rightPlayer ? weakCatScore(rightPlayer, weakCats) : 0
  if (rightScore !== leftScore) return rightScore - leftScore
  const leftSoft = leftPlayer ? softStreamerScore(leftPlayer, weakCats) : 0
  const rightSoft = rightPlayer ? softStreamerScore(rightPlayer, weakCats) : 0
  if (rightSoft !== leftSoft) return rightSoft - leftSoft
  return left.playerId.localeCompare(right.playerId)
}

const listTodayBlocks = (
  blocks: StreamingBlock[],
  date: string,
  seatedIds: Set<string>,
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
  strategyMode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
): StreamingBlock[] => {
  const candidates = blocks
    .filter((block) => block.startDate === date && !seatedIds.has(block.playerId))
    .filter((block) => block.remainingWeekGames > 0)
    .sort((left, right) => compareBlocks(left, right, playersById, weakCats))

  return candidates.filter((block) => {
    if (!allowsAddForTier(strategyMode, block.tier)) return false
    if (block.tier === "thin" && !allowsThinFill(strategyMode, dayIndex, dayCount)) {
      return false
    }
    return true
  })
}

const buildSummaryReasons = (
  strategyMode: StreamingStrategyMode,
  suggestedStrategyMode: StreamingStrategyMode,
  didProtectDrops: boolean,
): string[] => {
  const summaryReasons = [
    "Prioritized 3-in-4 / B2B blocks",
    "Adds only when the board improves",
  ]
  if (didProtectDrops) {
    summaryReasons.push("Protected ADP ≤ 60")
  }
  if (strategyMode === suggestedStrategyMode && strategyMode === "aggressive") {
    summaryReasons.push("Board behind → aggressive")
  }
  if (strategyMode === "conservative") {
    summaryReasons.push("Skipped thin one-game streams")
  }
  return summaryReasons.slice(0, 3)
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
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): {
  kind: StreamingPlanRosterDropKind
  playerId: string | null
  didProtect: boolean
} => {
  if (hasOpenNonIlSlot(entries)) {
    return { kind: "open_slot", playerId: null, didProtect: false }
  }

  const outDaysOf = (id: string) => injuryOutDaysByPlayerId?.[id] ?? 0
  const adpOf = (id: string) => adpByPlayerId?.[id] ?? null
  const isProtectedFromDrop = (player: SeasonPlayer) =>
    isAdpProtected(adpOf(player.id)) &&
    !isLongTermInjuryException(outDaysOf(player.id)) &&
    !isUnderperformingDropException(player)

  const rosteredNonIl = entries
    .filter((entry) => !isIlSlot(entry.slot) && entry.playerId)
    .map((entry) => playersById.get(entry.playerId!))
    .filter((p): p is SeasonPlayer => Boolean(p))
    .filter((p) => !alreadyDropped.has(p.id))

  const didProtect = rosteredNonIl.some(isProtectedFromDrop)
  const eligible = rosteredNonIl.filter((player) => !isProtectedFromDrop(player))

  const ilEntry = entries.find(
    (entry) =>
      isIlSlot(entry.slot) &&
      entry.playerId &&
      !alreadyDropped.has(entry.playerId),
  )
  const longTermNonIl = rosteredNonIl.filter((player) =>
    isLongTermInjuryException(outDaysOf(player.id)),
  )

  if (ilEntry?.playerId && longTermNonIl.length > 0) {
    const newlyInjured = longTermNonIl.slice().sort((left, right) => {
      const outDelta = outDaysOf(right.id) - outDaysOf(left.id)
      if (outDelta !== 0) return outDelta
      return left.id.localeCompare(right.id)
    })[0]!
    const dropId = chooseIlVersusNewInjuredDrop({
      il: {
        playerId: ilEntry.playerId,
        adp: adpOf(ilEntry.playerId),
        outDays: outDaysOf(ilEntry.playerId),
      },
      newlyInjured: {
        playerId: newlyInjured.id,
        adp: adpOf(newlyInjured.id),
        outDays: outDaysOf(newlyInjured.id),
      },
    })
    if (
      dropId &&
      !alreadyDropped.has(dropId) &&
      entries.some((entry) => entry.playerId === dropId)
    ) {
      return { kind: "player", playerId: dropId, didProtect }
    }
  }

  const candidates = eligible
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
  if (!best) return { kind: "none", playerId: null, didProtect }
  return { kind: "player", playerId: best.player.id, didProtect }
}

const isProtectedFromDrop = (
  player: SeasonPlayer,
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): boolean => {
  const outDays = injuryOutDaysByPlayerId?.[player.id] ?? 0
  const adp = adpByPlayerId?.[player.id] ?? null
  return (
    isAdpProtected(adp) &&
    !isLongTermInjuryException(outDays) &&
    !isUnderperformingDropException(player)
  )
}

const rosterHasProtectedPlayer = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  alreadyDropped: Set<string>,
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): boolean =>
  entries
    .filter((entry) => !isIlSlot(entry.slot) && entry.playerId)
    .map((entry) => playersById.get(entry.playerId!))
    .filter((p): p is SeasonPlayer => Boolean(p))
    .filter((p) => !alreadyDropped.has(p.id))
    .some((player) =>
      isProtectedFromDrop(player, adpByPlayerId, injuryOutDaysByPlayerId),
    )

const isValidForcedPlayerDrop = (
  playerId: string,
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  alreadyDropped: Set<string>,
): boolean => {
  if (alreadyDropped.has(playerId)) return false
  if (!entries.some((entry) => entry.playerId === playerId)) return false
  const player = playersById.get(playerId)
  if (!player) return false
  return true
}

const resolveRosterDrop = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  spotIndex: number,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  weekDroppedPlayers: Set<string>,
  forcedRosterDrops: Record<string, string | "open_slot" | "hold"> | undefined,
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): {
  kind: StreamingPlanRosterDropKind
  playerId: string | null
  didProtect: boolean
} => {
  const forceKey = streamingAddDropKey(date, spotIndex)
  const forced = forcedRosterDrops?.[forceKey]

  if (forced === "hold") {
    return { kind: "none", playerId: null, didProtect: false }
  }

  if (forced === "open_slot" && hasOpenNonIlSlot(entries)) {
    return { kind: "open_slot", playerId: null, didProtect: false }
  }

  if (typeof forced === "string" && forced !== "open_slot") {
    if (
      isValidForcedPlayerDrop(
        forced,
        entries,
        playersById,
        weekDroppedPlayers,
      )
    ) {
      const didProtect = rosterHasProtectedPlayer(
        entries,
        playersById,
        weekDroppedPlayers,
        adpByPlayerId,
        injuryOutDaysByPlayerId,
      )
      return { kind: "player", playerId: forced, didProtect }
    }
  }

  return pickRosterDrop(
    entries,
    playersById,
    date,
    schedule,
    weakCats,
    weekDroppedPlayers,
    adpByPlayerId,
    injuryOutDaysByPlayerId,
  )
}

export const buildStreamingPlan = ({
  spotCount,
  state,
  schedule,
  board,
  addLimit = WEEKLY_ADD_LIMIT,
  strategyMode: inputStrategy,
  adpByPlayerId,
  injuryOutDaysByPlayerId,
  forcedRosterDrops,
  daily,
  waiverPeriodDays: waiverPeriodDaysInput,
  winnerStreamRecipes = [],
  today,
}: BuildStreamingPlanInput): StreamingPlan => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const freeAgents = state.availablePlayerIds
    .map((id) => playersById.get(id))
    .filter((player): player is SeasonPlayer => Boolean(player?.teamAbbr))
  const waiverPeriodDays = resolveWaiverPeriodDays({
    inputDays: waiverPeriodDaysInput,
    leagueDays: state.waiverPeriodDays,
  })
  const droppedOnByPlayerId = new Map<string, string>()
  const markDropped = (playerId: string | null | undefined, date: string) => {
    if (playerId) droppedOnByPlayerId.set(playerId, date)
  }
  const canAddPlayer = (playerId: string, date: string) => {
    const droppedOn = droppedOnByPlayerId.get(playerId)
    if (!droppedOn) return true
    return !isOnWaiverCooldown(
      droppedOn,
      date,
      schedule.matchup.days,
      waiverPeriodDays,
    )
  }
  const addableFreeAgents = (date: string) =>
    freeAgents.filter((player) => canAddPlayer(player.id, date))
  const onlyAddable = (playerIds: string[], date: string) =>
    playerIds.filter((playerId) => canAddPlayer(playerId, date))

  const suggestedStrategyMode = suggestStreamingStrategyMode(board)
  const strategyMode = normalizeStreamingStrategyMode(
    inputStrategy ?? suggestedStrategyMode,
  )
  const blocks = findStreamingBlocks(freeAgents, schedule)
  const addableBlocks = (date: string) =>
    blocks.filter((block) => canAddPlayer(block.playerId, date))
  const weakCats = weakCategories(board)
  const occupants: (string | null)[] = Array.from({ length: spotCount }, () => null)
  const addsBySpot = Array.from({ length: spotCount }, () => 0)
  const dayCount = schedule.matchup.days.length
  let addsUsed = 0
  let gameStarts = 0
  let didProtectDrops = false
  const days: StreamingPlanDay[] = []
  const weekDroppedPlayers = new Set<string>()
  const youTeam = state.teams[state.perspectiveTeamIndex]
  const rosterSlots = rosterSlotsFor(state)
  let workingDaily: DailyLineups =
    daily ??
    initDailyLineups(
      schedule.matchup.days,
      youTeam?.entries ?? [],
      rosterSlots,
      state.players,
      schedule,
    )
  const isCompatibleAlternative = (chosenId: string, otherId: string) => {
    const chosen = playersById.get(chosenId)
    const other = playersById.get(otherId)
    return Boolean(chosen && other && isCompatibleStreamerAlternative(chosen, other))
  }
  const targetCatsFromMove = (
    beforeDaily: DailyLineups,
    afterDaily: DailyLineups,
  ): CategoryId[] => {
    const categoryIds = categoryIdsFromBoard(board)
    const opp = oppTotalsFromBoard(board)
    const before = buildMatchupBoard(
      youTotalsFromDaily(beforeDaily, state.players, schedule),
      opp,
      categoryIds,
    )
    const after = buildMatchupBoard(
      youTotalsFromDaily(afterDaily, state.players, schedule),
      opp,
      categoryIds,
    )
    return targetCategoryIdsFromBoards(before, after)
  }

  for (const [dayIndex, date] of schedule.matchup.days.entries()) {
    const cells: (StreamingPlanDayCell | null)[] = Array.from(
      { length: spotCount },
      () => null,
    )
    const seatedToday = new Set<string>()
    const previousOccupants = [...occupants]
    const forceFillForSpot = (spotIndex: number): boolean => {
      if (date !== today) return false
      const forced = forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)]
      return (
        forced === "open_slot" ||
        (typeof forced === "string" && forced !== "hold")
      )
    }

    // Pass 1: keep streamers who still have games left this week (hold through
    // off nights). Only free the spot when they have zero remaining games.
    // A today player/open_slot force skips hold so the chosen drop can spend an add.
    const afterDrop: (string | null)[] = occupants.map((playerId) => {
      if (!playerId) return null
      const player = playersById.get(playerId)
      if (!player) return null
      if (remainingGameDays(player, date, schedule) > 0) return playerId
      return null
    })

    const needFill: number[] = []
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
      const heldId = afterDrop[spotIndex]
      if (heldId && !forceFillForSpot(spotIndex)) {
        occupants[spotIndex] = heldId
        seatedToday.add(heldId)
        cells[spotIndex] = {
          spotIndex,
          playerId: heldId,
          action: "hold",
          droppedPlayerId: null,
          rosterDropPlayerId: null,
          rosterDropKind: "none",
          addIndex: null,
          alternativePlayerIds: [],
          targetCategoryIds: [],
        }
      } else {
        needFill.push(spotIndex)
      }
    }

    // Pace only early swaps on 2/3-spot; empty fills always spend weekly budget.
    // When behind on finishing addLimit, raise swap pace and loosen swap gates.
    const remainingDays = dayCount - dayIndex
    const remainingAdds = addLimit - addsUsed
    const budgetBehind =
      spotCount > 1 && isAddBudgetBehind(remainingAdds, remainingDays)
    const daySwapPaceCap =
      spotCount === 1
        ? addLimit
        : dailySwapPaceLimit(remainingAdds, remainingDays)
    let swapsToday = 0
    const canSpendWeeklyAdd = () => addsUsed < addLimit
    const canSpendSwapAdd = () =>
      canSpendWeeklyAdd() &&
      (spotCount === 1 || swapsToday < daySwapPaceCap)

    // Prefer spots that have used fewer adds so churn stays even across spots.
    needFill.sort((left, right) => {
      if (addsBySpot[left]! !== addsBySpot[right]!) {
        return addsBySpot[left]! - addsBySpot[right]!
      }
      return left - right
    })

    const dropBySpot = new Map<
      number,
      {
        kind: StreamingPlanRosterDropKind
        playerId: string | null
        didProtect: boolean
      }
    >()
    for (const spotIndex of [...needFill].sort((left, right) => left - right)) {
      if (previousOccupants[spotIndex] && !forceFillForSpot(spotIndex)) continue
      const rosterDrop = resolveRosterDrop(
        youTeam?.entries ?? [],
        playersById,
        date,
        spotIndex,
        schedule,
        weakCats,
        weekDroppedPlayers,
        forcedRosterDrops,
        adpByPlayerId,
        injuryOutDaysByPlayerId,
      )
      dropBySpot.set(spotIndex, rosterDrop)
      if (rosterDrop.kind === "player" && rosterDrop.playerId) {
        weekDroppedPlayers.add(rosterDrop.playerId)
      }
    }

    for (const spotIndex of needFill) {
      const previousId = previousOccupants[spotIndex] ?? null
      let playerId: string | null = null
      let action: StreamingPlanAction = "empty"
      let droppedPlayerId: string | null = null
      let addIndex: number | null = null
      let alternativePlayerIds: string[] = []
      let rosterDropKind: StreamingPlanRosterDropKind = "none"
      let rosterDropPlayerId: string | null = null
      let targetCategoryIds: CategoryId[] = []
      const forceFill = forceFillForSpot(spotIndex)
      const rosterDrop =
        previousId && !forceFill ? undefined : dropBySpot.get(spotIndex)
      const forced = forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)]

      if (forced === "hold") {
        action = "hold"
        playerId = previousId
      } else if (canSpendWeeklyAdd()) {
        const rankedBlocks = listTodayBlocks(
          addableBlocks(date),
          date,
          seatedToday,
          playersById,
          weakCats,
          strategyMode,
          dayIndex,
          dayCount,
        )
        const candidateIds =
          rankedBlocks.length > 0
            ? rankedBlocks.map((block) => block.playerId)
            : allowsThinFill(strategyMode, dayIndex, dayCount)
              ? rankEligibleFas(
                  addableFreeAgents(date),
                  date,
                  schedule,
                  weakCats,
                  seatedToday,
                ).map((entry) => entry.id)
              : []
        const drop: StreamerMoveDrop =
          previousId && !forceFill
            ? { kind: "player", playerId: previousId }
            : rosterDrop?.kind === "player" && rosterDrop.playerId
              ? { kind: "player", playerId: rosterDrop.playerId }
              : { kind: "none", playerId: null }
        const skipBecauseFull =
          drop.kind === "none" &&
          isDailyLineupFullForDate(workingDaily, date, playersById, schedule)
        const addableIds = onlyAddable(candidateIds, date)
        const picked =
          addableIds.length === 0 || skipBecauseFull
            ? null
            : pickBestStreamerMove(
                addableIds,
                workingDaily,
                date,
                drop,
                state.players,
                schedule,
                board,
                isCompatibleAlternative,
                { recipes: winnerStreamRecipes },
              )
        if (picked) {
          targetCategoryIds = targetCatsFromMove(workingDaily, picked.nextDaily)
          workingDaily = picked.nextDaily
          playerId = picked.playerId
          alternativePlayerIds = picked.alternativePlayerIds
          if (previousId && !forceFill) {
            action = "drop_add"
            droppedPlayerId = previousId
          } else {
            action = "add"
            if (rosterDrop) {
              if (rosterDrop.didProtect) didProtectDrops = true
              rosterDropKind = rosterDrop.kind
              rosterDropPlayerId = rosterDrop.playerId
            }
          }
          addsUsed += 1
          addsBySpot[spotIndex]! += 1
          addIndex = addsUsed
          seatedToday.add(picked.playerId)
          if (previousId && !forceFill) markDropped(previousId, date)
          if (rosterDrop?.kind === "player" && rosterDrop.playerId) {
            markDropped(rosterDrop.playerId, date)
          }
        } else if (rosterDrop?.kind === "player" && rosterDrop.playerId) {
          weekDroppedPlayers.delete(rosterDrop.playerId)
        }
      } else if (rosterDrop?.kind === "player" && rosterDrop.playerId) {
        weekDroppedPlayers.delete(rosterDrop.playerId)
      }

      if (forceFill && previousId && !playerId) {
        action = "hold"
        playerId = previousId
        seatedToday.add(previousId)
      }

      occupants[spotIndex] = playerId
      cells[spotIndex] = {
        spotIndex,
        playerId,
        action,
        droppedPlayerId,
        rosterDropPlayerId,
        rosterDropKind,
        addIndex,
        alternativePlayerIds,
        targetCategoryIds,
      }
    }

    // Early swap: keep density / multi-spot off-night when-gates; score by board.
    const isLateWeek = dayIndex >= Math.max(0, dayCount - 3)
    const spotOrder = [...Array(spotCount).keys()].sort(
      (left, right) => addsBySpot[left]! - addsBySpot[right]! || left - right,
    )
    for (const spotIndex of spotOrder) {
      const cell = cells[spotIndex]
      if (!cell || cell.action !== "hold" || !cell.playerId) continue
      if (forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)] === "hold") {
        continue
      }
      const occupant = playersById.get(cell.playerId)
      if (!occupant) continue
      if (!canSpendSwapAdd()) continue

      const heldPlaysToday = playsOn(occupant, date, schedule)
      const heldRemaining = remainingGameDays(occupant, date, schedule)
      if (heldRemaining <= 0) continue

      const isOneSpotOffNight =
        spotCount === 1 && !heldPlaysToday && heldRemaining > 0
      const isMultiSpotOffNight =
        spotCount > 1 && !heldPlaysToday && heldRemaining > 0

      const rankedBlocks = listTodayBlocks(
        addableBlocks(date),
        date,
        seatedToday,
        playersById,
        weakCats,
        strategyMode,
        dayIndex,
        dayCount,
      )
      let candidateIds = rankedBlocks.map((block) => block.playerId)
      if (
        candidateIds.length === 0 &&
        (isOneSpotOffNight ||
          (isMultiSpotOffNight && (isLateWeek || budgetBehind)))
      ) {
        candidateIds = rankEligibleFas(
          addableFreeAgents(date),
          date,
          schedule,
          weakCats,
          seatedToday,
        ).map((entry) => entry.id)
      }

      const todayBlock = rankedBlocks[0] ?? null
      if (isMultiSpotOffNight) {
        if (todayBlock == null) {
          if (!(isLateWeek || budgetBehind)) continue
        } else if (
          !allowsMultiSpotOffNightUpgrade(
            todayBlock.tier,
            dayIndex,
            dayCount,
            budgetBehind,
          )
        ) {
          continue
        }
      } else if (heldPlaysToday) {
        const held = blockFromDate(occupant, date, schedule)
        const heldRank = held ? densityTierRank(held.tier) : 0
        candidateIds = candidateIds.filter((upgradeId) => {
          const upgradePlayer = playersById.get(upgradeId)
          if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) {
            return false
          }
          const upgradeBlock = blockFromDate(upgradePlayer, date, schedule)
          const upgradeRank = upgradeBlock
            ? densityTierRank(upgradeBlock.tier)
            : 0
          return spotCount === 1
            ? allowsEarlySwap(strategyMode, heldRank, upgradeRank)
            : allowsMultiSpotEarlySwap(
                strategyMode,
                heldRank,
                upgradeRank,
                dayIndex,
                dayCount,
                budgetBehind,
              )
        })
      }
      candidateIds = candidateIds.filter((upgradeId) => {
        const upgradePlayer = playersById.get(upgradeId)
        return Boolean(
          upgradePlayer &&
            playsOn(upgradePlayer, date, schedule) &&
            remainingGameDays(upgradePlayer, date, schedule) > 0,
        )
      })
      candidateIds = onlyAddable(candidateIds, date)
      if (candidateIds.length === 0) continue

      const picked = pickBestStreamerMove(
        candidateIds,
        workingDaily,
        date,
        { kind: "player", playerId: cell.playerId },
        state.players,
        schedule,
        board,
        isCompatibleAlternative,
        isOneSpotOffNight
          ? { requirePositiveDelta: false, recipes: winnerStreamRecipes }
          : { recipes: winnerStreamRecipes },
      )
      if (!picked) continue

      markDropped(cell.playerId, date)
      seatedToday.delete(cell.playerId)
      seatedToday.add(picked.playerId)
      occupants[spotIndex] = picked.playerId
      const targetCategoryIds = targetCatsFromMove(workingDaily, picked.nextDaily)
      workingDaily = picked.nextDaily
      addsUsed += 1
      swapsToday += 1
      addsBySpot[spotIndex]! += 1
      cells[spotIndex] = {
        spotIndex,
        playerId: picked.playerId,
        action: "drop_add",
        droppedPlayerId: cell.playerId,
        rosterDropPlayerId: null,
        rosterDropKind: "none",
        addIndex: addsUsed,
        alternativePlayerIds: picked.alternativePlayerIds,
        targetCategoryIds,
      }
    }

    const dayCells = cells.map((cell) => {
      const resolved = cell!
      if (resolved.playerId) {
        const player = playersById.get(resolved.playerId)
        if (player && playsOn(player, date, schedule)) gameStarts += 1
      }
      return resolved
    })

    days.push({ date, cells: dayCells })
  }

  return {
    spotCount,
    addLimit,
    addsUsed,
    gameStarts,
    strategyMode,
    suggestedStrategyMode,
    summaryReasons: buildSummaryReasons(
      strategyMode,
      suggestedStrategyMode,
      didProtectDrops,
    ),
    days,
  }
}

export const buildAllStreamingPlans = (
  input: Omit<BuildStreamingPlanInput, "spotCount">,
): StreamingPlan[] =>
  ([1, 2, 3] as const).map((spotCount) =>
    buildStreamingPlan({ ...input, spotCount }),
  )
