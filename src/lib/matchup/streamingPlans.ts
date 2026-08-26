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
  forcedRosterDrops?: Record<string, string | "open_slot">
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
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): boolean => {
  if (alreadyDropped.has(playerId)) return false
  if (!entries.some((entry) => entry.playerId === playerId)) return false
  const player = playersById.get(playerId)
  if (!player) return false
  return !isProtectedFromDrop(player, adpByPlayerId, injuryOutDaysByPlayerId)
}

const resolveRosterDrop = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  spotIndex: number,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  weekDroppedPlayers: Set<string>,
  forcedRosterDrops: Record<string, string | "open_slot"> | undefined,
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): {
  kind: StreamingPlanRosterDropKind
  playerId: string | null
  didProtect: boolean
} => {
  const forceKey = streamingAddDropKey(date, spotIndex)
  const forced = forcedRosterDrops?.[forceKey]

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
        adpByPlayerId,
        injuryOutDaysByPlayerId,
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
  const weekDroppedPlayers = new Set<string>()

  for (const [dayIndex, date] of schedule.matchup.days.entries()) {
    const cells: (StreamingPlanDayCell | null)[] = Array.from(
      { length: spotCount },
      () => null,
    )
    const seatedToday = new Set<string>()
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

    // Early swap: 1-spot always-cover; 2/3-spot density ok+ (or late-week thin);
    // else denser on-game block today. Prefer spots with fewer adds first.
    const isLateWeek = dayIndex >= Math.max(0, dayCount - 3)
    const spotOrder = [...Array(spotCount).keys()].sort(
      (left, right) => addsBySpot[left]! - addsBySpot[right]! || left - right,
    )
    for (const spotIndex of spotOrder) {
      const cell = cells[spotIndex]
      if (!cell || cell.action !== "hold" || !cell.playerId) continue
      const occupant = playersById.get(cell.playerId)
      if (!occupant) continue
      if (addsUsed >= addLimit) continue

      const heldPlaysToday = playsOn(occupant, date, schedule)
      const heldRemaining = remainingGameDays(occupant, date, schedule)
      if (heldRemaining <= 0) continue

      const isOneSpotAlwaysCover =
        spotCount === 1 && !heldPlaysToday && heldRemaining > 0
      const isMultiSpotOffNight =
        spotCount > 1 && !heldPlaysToday && heldRemaining > 0

      let upgradePlayer: SeasonPlayer | null = null
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
      if (todayBlock) {
        upgradePlayer = playersById.get(todayBlock.playerId) ?? null
      } else if (isOneSpotAlwaysCover) {
        upgradePlayer = pickBestFa(freeAgents, date, schedule, weakCats, seatedToday)
      } else if (isMultiSpotOffNight && isLateWeek) {
        upgradePlayer = pickBestFa(freeAgents, date, schedule, weakCats, seatedToday)
      }

      if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) continue
      const upgradeRemaining = remainingGameDays(upgradePlayer, date, schedule)
      if (upgradeRemaining <= 0) continue

      if (isOneSpotAlwaysCover) {
        // Accept any today-playing FA; no remaining-games gate.
      } else if (isMultiSpotOffNight) {
        const denseEnough =
          todayBlock != null &&
          densityTierRank(todayBlock.tier) >= densityTierRank("ok")
        // Mid-week thin (any strategy, including Aggressive) → hold.
        if (!denseEnough && !isLateWeek) continue
      } else {
        if (!heldPlaysToday) continue
        const held = blockFromDate(occupant, date, schedule)
        const heldRank = held ? densityTierRank(held.tier) : 0
        const upgradeBlock = blockFromDate(upgradePlayer, date, schedule)
        const upgradeRank = upgradeBlock
          ? densityTierRank(upgradeBlock.tier)
          : densityTierRank(todayBlock?.tier ?? "thin")
        if (
          !allowsEarlySwap(
            strategyMode,
            heldRank,
            todayBlock ? densityTierRank(todayBlock.tier) : upgradeRank,
          )
        ) {
          continue
        }
      }

      seatedToday.delete(cell.playerId)
      seatedToday.add(upgradePlayer.id)
      occupants[spotIndex] = upgradePlayer.id
      addsUsed += 1
      addsBySpot[spotIndex]! += 1
      cells[spotIndex] = {
        spotIndex,
        playerId: upgradePlayer.id,
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

    const pendingAdds: number[] = []

    for (const spotIndex of needFill) {
      const previousId = previousOccupants[spotIndex] ?? null
      let playerId: string | null = null
      let action: StreamingPlanAction = "empty"
      let droppedPlayerId: string | null = null
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
            pendingAdds.push(spotIndex)
          }
          addsUsed += 1
          addsBySpot[spotIndex]! += 1
          addIndex = addsUsed
          seatedToday.add(best.id)
        }
      }

      occupants[spotIndex] = playerId
      cells[spotIndex] = {
        spotIndex,
        playerId,
        action,
        droppedPlayerId,
        rosterDropPlayerId: null,
        rosterDropKind: "none",
        addIndex,
      }
    }

    pendingAdds.sort((left, right) => left - right)
    for (const spotIndex of pendingAdds) {
      const rosterDrop = resolveRosterDrop(
        state.teams[state.perspectiveTeamIndex]!.entries,
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
      if (rosterDrop.didProtect) didProtectDrops = true
      if (rosterDrop.kind === "player" && rosterDrop.playerId) {
        weekDroppedPlayers.add(rosterDrop.playerId)
      }
      const cell = cells[spotIndex]!
      cells[spotIndex] = {
        ...cell,
        rosterDropKind: rosterDrop.kind,
        rosterDropPlayerId: rosterDrop.playerId,
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
