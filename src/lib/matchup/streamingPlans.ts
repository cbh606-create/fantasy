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
  StreamingStrategyMode,
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
  allowsThinFill,
  densityTierRank,
  normalizeStreamingStrategyMode,
  suggestStreamingStrategyMode,
} from "./streamingStrategy"
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
  strategyMode?: StreamingStrategyMode
  adpByPlayerId?: Record<string, number>
  injuryOutDaysByPlayerId?: Record<string, number>
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
      // Prefer leftover starts first so one add covers more games.
      volume: remainingGameDays(player, date, schedule),
      stretch: nearTermStretch(player, date, schedule),
      score: weakCatScore(player, weakCats),
    }))
    .filter((entry) => entry.volume > 0)
    .sort((left, right) => {
      if (right.volume !== left.volume) return right.volume - left.volume
      if (right.stretch !== left.stretch) return right.stretch - left.stretch
      if (right.score !== left.score) return right.score - left.score
      return left.player.id.localeCompare(right.player.id)
    })

  return eligible[0]?.player ?? null
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
  return left.playerId.localeCompare(right.playerId)
}

const pickTodayBlock = (
  blocks: StreamingBlock[],
  date: string,
  seatedIds: Set<string>,
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
  strategyMode: StreamingStrategyMode,
  dayIndex: number,
  dayCount: number,
): StreamingBlock | null => {
  const candidates = blocks
    .filter((block) => block.startDate === date && !seatedIds.has(block.playerId))
    .filter((block) => block.remainingWeekGames > 0)
    .sort((left, right) => compareBlocks(left, right, playersById, weakCats))

  for (const block of candidates) {
    if (!allowsAddForTier(strategyMode, block.tier)) continue
    if (block.tier === "thin" && !allowsThinFill(strategyMode, dayIndex, dayCount)) {
      continue
    }
    return block
  }
  return null
}

const buildSummaryReasons = (
  strategyMode: StreamingStrategyMode,
  suggestedStrategyMode: StreamingStrategyMode,
  didProtectDrops: boolean,
): string[] => {
  const summaryReasons = [
    "Prioritized 3-in-4 / B2B blocks",
    "Maximizing starts within add budget",
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

export const buildStreamingPlan = ({
  spotCount,
  state,
  schedule,
  board,
  addLimit = WEEKLY_ADD_LIMIT,
  strategyMode: inputStrategy,
  adpByPlayerId,
  injuryOutDaysByPlayerId,
}: BuildStreamingPlanInput): StreamingPlan => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const freeAgents = state.availablePlayerIds
    .map((id) => playersById.get(id))
    .filter((player): player is SeasonPlayer => Boolean(player?.teamAbbr))

  const suggestedStrategyMode = suggestStreamingStrategyMode(board)
  const strategyMode = normalizeStreamingStrategyMode(
    inputStrategy ?? suggestedStrategyMode,
  )
  const blocks = findStreamingBlocks(freeAgents, schedule)
  const weakCats = weakCategories(board)
  const occupants: (string | null)[] = Array.from({ length: spotCount }, () => null)
  const addsBySpot = Array.from({ length: spotCount }, () => 0)
  const dayCount = schedule.matchup.days.length
  let addsUsed = 0
  let gameStarts = 0
  let didProtectDrops = false
  const days: StreamingPlanDay[] = []

  for (const [dayIndex, date] of schedule.matchup.days.entries()) {
    const cells: (StreamingPlanDayCell | null)[] = Array.from(
      { length: spotCount },
      () => null,
    )
    const seatedToday = new Set<string>()
    const rosterDroppedToday = new Set<string>()
    const previousOccupants = [...occupants]

    // Pass 1: keep streamers who still have games left this week (hold through
    // off nights). Only free the spot when they have zero remaining games.
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
      if (heldId) {
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
        }
      } else {
        needFill.push(spotIndex)
      }
    }

    // Early swap: while holding, spend an add on a denser block that starts today.
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
      const cell = cells[spotIndex]
      if (!cell || cell.action !== "hold" || !cell.playerId) continue
      const occupant = playersById.get(cell.playerId)
      if (!occupant) continue
      if (remainingGameDays(occupant, date, schedule) <= 0) continue
      if (addsUsed >= addLimit) continue

      const held = blockFromDate(occupant, date, schedule)
      const heldRank = held ? densityTierRank(held.tier) : 0
      const upgrade = pickTodayBlock(
        blocks,
        date,
        seatedToday,
        playersById,
        weakCats,
        strategyMode,
        dayIndex,
        dayCount,
      )
      if (!upgrade) continue
      const upgradePlayer = playersById.get(upgrade.playerId)
      if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) continue
      if (remainingGameDays(upgradePlayer, date, schedule) <= 0) continue
      if (!allowsEarlySwap(strategyMode, heldRank, densityTierRank(upgrade.tier))) {
        continue
      }

      seatedToday.delete(cell.playerId)
      seatedToday.add(upgrade.playerId)
      occupants[spotIndex] = upgrade.playerId
      addsUsed += 1
      addsBySpot[spotIndex]! += 1
      cells[spotIndex] = {
        spotIndex,
        playerId: upgrade.playerId,
        action: "drop_add",
        droppedPlayerId: cell.playerId,
        rosterDropPlayerId: null,
        rosterDropKind: "none",
        addIndex: addsUsed,
      }
    }

    // Prefer spots that have used fewer adds so churn stays even across spots.
    needFill.sort((left, right) => {
      if (addsBySpot[left]! !== addsBySpot[right]!) {
        return addsBySpot[left]! - addsBySpot[right]!
      }
      return left - right
    })

    for (const spotIndex of needFill) {
      const previousId = previousOccupants[spotIndex] ?? null
      let playerId: string | null = null
      let action: StreamingPlanAction = "empty"
      let droppedPlayerId: string | null = null
      let rosterDropKind: StreamingPlanRosterDropKind = "none"
      let rosterDropPlayerId: string | null = null
      let addIndex: number | null = null

      if (addsUsed < addLimit) {
        const todayBlock = pickTodayBlock(
          blocks,
          date,
          seatedToday,
          playersById,
          weakCats,
          strategyMode,
          dayIndex,
          dayCount,
        )
        const best = todayBlock
          ? (playersById.get(todayBlock.playerId) ?? null)
          : allowsThinFill(strategyMode, dayIndex, dayCount)
            ? pickBestFa(freeAgents, date, schedule, weakCats, seatedToday)
            : null
        const expectedStarts = best
          ? remainingGameDays(best, date, schedule)
          : 0
        if (best && expectedStarts > 0) {
          playerId = best.id
          if (previousId) {
            action = "drop_add"
            droppedPlayerId = previousId
          } else {
            action = "add"
          }
          addsUsed += 1
          addsBySpot[spotIndex]! += 1
          addIndex = addsUsed
          seatedToday.add(best.id)
        }
      }

      if (action === "add") {
        const rosterDrop = pickRosterDrop(
          state.teams[state.perspectiveTeamIndex]!.entries,
          playersById,
          date,
          schedule,
          weakCats,
          rosterDroppedToday,
          adpByPlayerId,
          injuryOutDaysByPlayerId,
        )
        rosterDropKind = rosterDrop.kind
        rosterDropPlayerId = rosterDrop.playerId
        if (rosterDrop.didProtect) didProtectDrops = true
        if (rosterDrop.kind === "player" && rosterDrop.playerId) {
          rosterDroppedToday.add(rosterDrop.playerId)
        }
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
