import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { SURPLUS_WIN_PROB } from "./constants"
import { streamingAddLimitForSchedule } from "./games"
import {
  initDailyLineups,
  isDailyLineupFullForDate,
  type DailyLineups,
  youTotalsFromDaily,
} from "./dailyLineups"
import { rosterSlotsFor } from "./eligibility"
import {
  categoryIdsFromBoard,
  matchupBoardFromDaily,
  oppTotalsFromBoard,
  pickBestStreamerMove,
  type StreamerMoveDrop,
} from "./streamerMove"
import {
  isCloseLosingCategory,
  targetCategoryIdsFromBoards,
} from "./streamingDropExplain"
import type {
  MatchupBoard,
  OpponentStreamDay,
  OpponentStreamDayCell,
  StatWindow,
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
import { gameWeightForTeamDate } from "./games"
import { seatStreamerIfOpen } from "./streamerMove"
import {
  isOnWaiverCooldown,
  resolveWaiverPeriodDays,
} from "./streamingWaiver"
import {
  buildHoleDayLineup,
  countHoleB2bPairs,
  countOpenActiveSlots,
  countTeamStarts,
  pickAutoRosterCut,
  playerHasEligibleHole,
  remainingHoleStarts,
} from "./streamingHoleCalendar"
import { applyStreamingPlanPreview } from "./applyStreamingPlanPreview"

const PRIMARY_STREAMER_CATEGORIES: CategoryId[] = [
  "TPM",
  "REB",
  "AST",
  "STL",
  "BLK",
  "PTS",
]

/** Soft tie-breakers after volume / stretch / primary weak cats. */
const SOFT_STREAMER_CATEGORIES: CategoryId[] = ["TO"]

const FG_PCT_REPLACEMENT = 0.47
const FT_PCT_REPLACEMENT = 0.78

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
  /**
   * Opp spotIndex → roster player id to cut the first time that spot
   * needs a roster drop. `null` / omitted = Auto.
   */
  forcedOpponentRosterDrops?: (string | null)[]
  /** When set, skip add spends on dates whose Daily active lineup is already full. */
  daily?: DailyLineups
  /** Overrides `state.waiverPeriodDays`. Default 2 matchup days. */
  waiverPeriodDays?: number
  winnerStreamRecipes?: WinnerStreamRecipe[]
  today?: string
  oppSpotCount?: 1 | 2 | 3
  opponentTeamIndex?: number
  /** Skip you adds/holds so opponent streaming sees the full FA pool. */
  youIdle?: boolean
  statWindow?: StatWindow
}

export const streamingAddDropKey = (date: string, spotIndex: number) =>
  `${date}:${spotIndex}`

const weakCategories = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.outcome === "L" || row.outcome === "T")
    .map((row) => row.categoryId)

const surplusCategoryIds = (board: MatchupBoard): CategoryId[] =>
  board.categories
    .filter((row) => row.outcome === "W" && row.winProb >= SURPLUS_WIN_PROB)
    .map((row) => row.categoryId)

const categoryContribution = (
  player: SeasonPlayer,
  games: number,
  categoryId: CategoryId,
  window: StatWindow = "season",
): number => {
  const weekly = weeklyPlayerStats(player, games, window)
  const value = weekly.projections[categoryId]
  return categoryId === "TO" ? -value : value
}

const shootingHelp = (
  player: SeasonPlayer,
  games: number,
  categoryId: CategoryId,
  window: StatWindow = "season",
): number => {
  const weekly = weeklyPlayerStats(player, games, window)
  if (categoryId === "FG_PCT") {
    return weekly.shooting.FGA * (weekly.projections.FG_PCT - FG_PCT_REPLACEMENT)
  }
  if (categoryId === "FT_PCT") {
    return weekly.shooting.FTA * (weekly.projections.FT_PCT - FT_PCT_REPLACEMENT)
  }
  return 0
}

const weakCatHelp = (
  player: SeasonPlayer,
  games: number,
  categoryId: CategoryId,
  window: StatWindow = "season",
): number => {
  if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
    return shootingHelp(player, games, categoryId, window)
  }
  if (!PRIMARY_STREAMER_CATEGORIES.includes(categoryId)) return 0
  return categoryContribution(player, games, categoryId, window)
}

const weakCatScore = (
  player: SeasonPlayer,
  weakCats: CategoryId[],
  window: StatWindow = "season",
): number =>
  weakCats.reduce(
    (sum, categoryId) => sum + weakCatHelp(player, 1, categoryId, window),
    0,
  )

/** TO when that cat is L/T — never overrides volume/stretch/primary. */
const softStreamerScore = (
  player: SeasonPlayer,
  weakCats: CategoryId[],
  window: StatWindow = "season",
): number =>
  weakCats.reduce((sum, categoryId) => {
    if (!SOFT_STREAMER_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, 1, categoryId, window)
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

/** NBA games from fromDate that the player can actually sit in `daily`. */
const remainingSeatableGameDays = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
  daily: DailyLineups | undefined,
  playersById: Map<string, SeasonPlayer>,
): number => {
  const remaining = schedule.matchup.days.filter((day) => day >= fromDate)
  return remaining.filter((day) => {
    if (!playsOn(player, day, schedule)) return false
    const entries = daily?.[day]
    if (!entries) return true
    const clone = entries.map((entry) => ({ ...entry }))
    return seatStreamerIfOpen(clone, player.id, day, playersById, schedule)
  }).length
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
  budgetBehind = false,
  window: StatWindow = "season",
): SeasonPlayer[] => {
  const eligible = candidates
    .filter((player) => !seatedIds.has(player.id))
    .filter((player) => playsOn(player, date, schedule))
    .map((player) => ({
      player,
      // Prefer leftover starts first so one add covers more games.
      volume: remainingGameDays(player, date, schedule),
      stretch: nearTermStretch(player, date, schedule),
      score: weakCatScore(player, weakCats, window),
      soft: softStreamerScore(player, weakCats, window),
    }))
    .filter((entry) => entry.volume > 0)
    .sort((left, right) => {
      if (budgetBehind) {
        if (right.score !== left.score) return right.score - left.score
        if (right.soft !== left.soft) return right.soft - left.soft
        if (right.volume !== left.volume) return right.volume - left.volume
        if (right.stretch !== left.stretch) return right.stretch - left.stretch
        return left.player.id.localeCompare(right.player.id)
      }
      if (right.volume !== left.volume) return right.volume - left.volume
      if (right.stretch !== left.stretch) return right.stretch - left.stretch
      if (right.score !== left.score) return right.score - left.score
      if (right.soft !== left.soft) return right.soft - left.soft
      return left.player.id.localeCompare(right.player.id)
    })

  return eligible.map((entry) => entry.player)
}

const rankHoleEligibleFas = (
  candidates: SeasonPlayer[],
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  seatedIds: Set<string>,
  holeByDate: Record<string, SeasonRosterEntry[]>,
  window: StatWindow = "season",
): SeasonPlayer[] =>
  candidates
    .filter((player) => !seatedIds.has(player.id))
    .filter((player) => playsOn(player, date, schedule))
    .map((player) => ({
      player,
      starts: remainingHoleStarts(
        player,
        date,
        schedule.matchup.days,
        holeByDate,
        schedule,
      ),
      b2bPairs: countHoleB2bPairs(
        player,
        date,
        schedule.matchup.days,
        holeByDate,
        schedule,
      ),
      score: weakCatScore(player, weakCats, window),
      soft: softStreamerScore(player, weakCats, window),
    }))
    .filter((entry) => entry.starts > 0)
    .sort((left, right) => {
      if (right.starts !== left.starts) return right.starts - left.starts
      if (right.b2bPairs !== left.b2bPairs) return right.b2bPairs - left.b2bPairs
      if (right.score !== left.score) return right.score - left.score
      if (right.soft !== left.soft) return right.soft - left.soft
      return left.player.id.localeCompare(right.player.id)
    })
    .map((entry) => entry.player)

const topHoleTierIds = (
  ranked: SeasonPlayer[],
  date: string,
  schedule: ScheduleResponse,
  holeByDate: Record<string, SeasonRosterEntry[]>,
): string[] => {
  const winner = ranked[0]
  if (!winner) return []
  const winnerStarts = remainingHoleStarts(
    winner,
    date,
    schedule.matchup.days,
    holeByDate,
    schedule,
  )
  const winnerB2bPairs = countHoleB2bPairs(
    winner,
    date,
    schedule.matchup.days,
    holeByDate,
    schedule,
  )
  return ranked
    .filter(
      (player) =>
        remainingHoleStarts(
          player,
          date,
          schedule.matchup.days,
          holeByDate,
          schedule,
        ) === winnerStarts &&
        countHoleB2bPairs(
          player,
          date,
          schedule.matchup.days,
          holeByDate,
          schedule,
        ) === winnerB2bPairs,
    )
    .map((player) => player.id)
}

const compareBlocks = (
  left: StreamingBlock,
  right: StreamingBlock,
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
  budgetBehind = false,
  window: StatWindow = "season",
): number => {
  const leftPlayer = playersById.get(left.playerId)
  const rightPlayer = playersById.get(right.playerId)
  const leftScore = leftPlayer ? weakCatScore(leftPlayer, weakCats, window) : 0
  const rightScore = rightPlayer
    ? weakCatScore(rightPlayer, weakCats, window)
    : 0
  const leftSoft = leftPlayer
    ? softStreamerScore(leftPlayer, weakCats, window)
    : 0
  const rightSoft = rightPlayer
    ? softStreamerScore(rightPlayer, weakCats, window)
    : 0
  if (budgetBehind) {
    if (rightScore !== leftScore) return rightScore - leftScore
    if (rightSoft !== leftSoft) return rightSoft - leftSoft
    if (right.remainingWeekGames !== left.remainingWeekGames) {
      return right.remainingWeekGames - left.remainingWeekGames
    }
    const tierDelta = densityTierRank(right.tier) - densityTierRank(left.tier)
    if (tierDelta !== 0) return tierDelta
    return left.playerId.localeCompare(right.playerId)
  }
  if (right.remainingWeekGames !== left.remainingWeekGames) {
    return right.remainingWeekGames - left.remainingWeekGames
  }
  const tierDelta = densityTierRank(right.tier) - densityTierRank(left.tier)
  if (tierDelta !== 0) return tierDelta
  if (rightScore !== leftScore) return rightScore - leftScore
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
  budgetBehind = false,
  window: StatWindow = "season",
): StreamingBlock[] => {
  const candidates = blocks
    .filter((block) => block.startDate === date && !seatedIds.has(block.playerId))
    .filter((block) => block.remainingWeekGames > 0)
    .sort((left, right) =>
      compareBlocks(left, right, playersById, weakCats, budgetBehind, window),
    )

  if (budgetBehind) return candidates

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
    "Fills empty stream spots for the week",
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
  window: StatWindow = "season",
) =>
  weakCats.reduce((sum, categoryId) => {
    if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
      return sum + shootingHelp(player, games, categoryId, window)
    }
    if (!STREAMER_COUNTING_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, games, categoryId, window)
  }, 0)

const surplusCatScoreForGames = (
  player: SeasonPlayer,
  games: number,
  surplusCats: CategoryId[],
  window: StatWindow = "season",
) =>
  surplusCats.reduce((sum, categoryId) => {
    if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
      return sum + shootingHelp(player, games, categoryId, window)
    }
    if (!STREAMER_COUNTING_CATEGORIES.includes(categoryId)) return sum
    return sum + categoryContribution(player, games, categoryId, window)
  }, 0)

const rankRosterDropPlayerIds = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  alreadyDropped: Set<string>,
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
  board?: MatchupBoard,
  budgetBehind = false,
  protectCoreRoster = false,
  window: StatWindow = "season",
): string[] => {
  const outDaysOf = (id: string) => injuryOutDaysByPlayerId?.[id] ?? 0
  const adpOf = (id: string) => adpByPlayerId?.[id] ?? null
  const isCoreRosterHold = (player: SeasonPlayer): boolean => {
    if (!protectCoreRoster) return false
    if (isAdpProtected(adpOf(player.id))) return true
    return (
      playsOn(player, date, schedule) &&
      remainingGameDays(player, date, schedule) >= 3
    )
  }

  const rosteredNonIl = entries
    .filter((entry) => !isIlSlot(entry.slot) && entry.playerId)
    .map((entry) => playersById.get(entry.playerId!))
    .filter((p): p is SeasonPlayer => Boolean(p))
    .filter((p) => !alreadyDropped.has(p.id))
    .filter((p) => !isCoreRosterHold(p))

  const ilEntry = entries.find(
    (entry) =>
      isIlSlot(entry.slot) &&
      entry.playerId &&
      !alreadyDropped.has(entry.playerId),
  )
  const longTermNonIl = rosteredNonIl.filter((player) =>
    isLongTermInjuryException(outDaysOf(player.id)),
  )
  const ilFirst: string[] = []
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
      ilFirst.push(dropId)
    }
  }

  const surplusCats = board ? surplusCategoryIds(board) : []
  const ranked = rosteredNonIl
    .filter((player) => !ilFirst.includes(player.id))
    .map((p) => ({
      player: p,
      noGame: playsOn(p, date, schedule) ? 0 : 1,
      volume: remainingGameDays(p, date, schedule),
      weak: weakCatScoreForGames(p, 1, weakCats, window),
      surplus: surplusCatScoreForGames(p, 1, surplusCats, window),
    }))
    .sort((left, right) => {
      if (budgetBehind) {
        const leftExpendable = left.surplus - left.weak
        const rightExpendable = right.surplus - right.weak
        if (rightExpendable !== leftExpendable) {
          return rightExpendable - leftExpendable
        }
        if (left.weak !== right.weak) return left.weak - right.weak
        if (left.volume !== right.volume) return left.volume - right.volume
        return left.player.id.localeCompare(right.player.id)
      }
      if (right.noGame !== left.noGame) return right.noGame - left.noGame
      if (left.volume !== right.volume) return left.volume - right.volume
      if (left.weak !== right.weak) return left.weak - right.weak
      return left.player.id.localeCompare(right.player.id)
    })
    .map((entry) => entry.player.id)

  return [...ilFirst, ...ranked]
}

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

const rosterGameCountForDate = (
  daily: DailyLineups,
  date: string,
  playersById: Map<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): number => {
  const entries = daily[date] ?? []
  return entries.filter((entry) => {
    if (!entry.playerId) return false
    const player = playersById.get(entry.playerId)
    if (!player?.teamAbbr) return false
    return gameWeightForTeamDate(player.teamAbbr, date, schedule) > 0
  }).length
}

const fillOpponentSpotsForDate = ({
  date,
  spotCount,
  occupants,
  oppWorkingDaily,
  youWorkingDaily,
  oppEntries,
  rosterSlots,
  takenToday,
  addLimit,
  addsUsed,
  weekDropped,
  rosterDroppedSpots,
  playersById,
  players,
  schedule,
  weakCats,
  board,
  recipes,
  adpByPlayerId,
  injuryOutDaysByPlayerId,
  forcedOpponentRosterDrops,
  isCompatibleAlternative,
  candidateIds,
  onDropped,
  statWindow = "season",
}: {
  date: string
  spotCount: 1 | 2 | 3
  occupants: (string | null)[]
  oppWorkingDaily: DailyLineups
  youWorkingDaily: DailyLineups
  oppEntries: SeasonRosterEntry[]
  rosterSlots: SeasonSlot[]
  takenToday: Set<string>
  addLimit: number
  addsUsed: number
  weekDropped: Set<string>
  rosterDroppedSpots: Set<number>
  playersById: Map<string, SeasonPlayer>
  players: SeasonPlayer[]
  schedule: ScheduleResponse
  weakCats: CategoryId[]
  board: MatchupBoard
  recipes: WinnerStreamRecipe[]
  adpByPlayerId?: Record<string, number>
  injuryOutDaysByPlayerId?: Record<string, number>
  forcedOpponentRosterDrops?: (string | null)[]
  isCompatibleAlternative: (chosenId: string, otherId: string) => boolean
  candidateIds: string[]
  onDropped?: (playerId: string, date: string) => void
  statWindow?: StatWindow
}): {
  streamerPlayerId: string | null
  droppedPlayerId: string | null
  rosterGameCount: number
  addsUsed: number
  workingDaily: DailyLineups
  cells: OpponentStreamDayCell[]
} => {
  let workingDaily = oppWorkingDaily
  let nextAddsUsed = addsUsed
  let justAdded: string | null = null
  let justDropped: string | null = null
  const previousOccupants = [...occupants]
  const droppedBySpot = new Map<number, string | null>()
  const addIndexBySpot = new Map<number, number>()

  const needFill: number[] = []
  for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
    const playerId = occupants[spotIndex]
    if (playerId) {
      const player = playersById.get(playerId)
      if (player && remainingGameDays(player, date, schedule) > 0) {
        continue
      }
    }
    occupants[spotIndex] = null
    needFill.push(spotIndex)
  }

  const forcedHoleDropBySpot = new Map<number, string>()
  const prospectiveCuts = new Set(weekDropped)
  for (const spotIndex of needFill) {
    if (rosterDroppedSpots.has(spotIndex)) continue
    const forcedId = forcedOpponentRosterDrops?.[spotIndex]
    if (
      typeof forcedId === "string" &&
      isValidForcedPlayerDrop(
        forcedId,
        oppEntries,
        playersById,
        prospectiveCuts,
      )
    ) {
      prospectiveCuts.add(forcedId)
      forcedHoleDropBySpot.set(spotIndex, forcedId)
    }
  }
  const holeByDate = Object.fromEntries(
    schedule.matchup.days.map((day) => [
      day,
      buildHoleDayLineup({
        day,
        teamEntries: oppEntries,
        players,
        schedule,
        cutPlayerIds: prospectiveCuts,
        savedDay: undefined,
        rosterSlots,
      }),
    ]),
  )
  const holeLineup = holeByDate[date] ?? []
  const streamerCap = Math.min(spotCount, countOpenActiveSlots(holeLineup))
  const rankedCandidates = rankHoleEligibleFas(
    candidateIds
      .map((id) => playersById.get(id))
      .filter((player): player is SeasonPlayer => Boolean(player)),
    date,
    schedule,
    weakCats,
    takenToday,
    holeByDate,
    statWindow,
  )
  candidateIds = topHoleTierIds(rankedCandidates, date, schedule, holeByDate)
  const fillableSpots = new Set(
    Array.from(
      new Set([
        ...forcedHoleDropBySpot.keys(),
        ...Array.from({ length: spotCount }, (_, index) => index),
      ]),
    ).slice(0, streamerCap),
  )
  for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
    if (fillableSpots.has(spotIndex)) continue
    occupants[spotIndex] = null
    if (!needFill.includes(spotIndex)) needFill.push(spotIndex)
  }

  for (const spotIndex of needFill) {
    if (!fillableSpots.has(spotIndex)) {
      occupants[spotIndex] = null
      continue
    }
    if (nextAddsUsed >= addLimit) {
      occupants[spotIndex] = null
      continue
    }

    const previousId = previousOccupants[spotIndex] ?? null
    const occupantIds = new Set(
      occupants.filter((id): id is string => Boolean(id)),
    )
    const leftoverIds = candidateIds.filter(
      (id) => !takenToday.has(id) && !occupantIds.has(id),
    )
    const tryOppMove = (
      drop: StreamerMoveDrop,
      requirePositiveDelta: boolean,
    ) => {
      const skipBecauseFull =
        drop.kind === "none" &&
        isDailyLineupFullForDate(workingDaily, date, playersById, schedule)
      if (leftoverIds.length === 0 || skipBecauseFull) return null
      return pickBestStreamerMove(
        leftoverIds,
        workingDaily,
        date,
        drop,
        players,
        schedule,
        board,
        isCompatibleAlternative,
        {
          recipes,
          oppDaily: youWorkingDaily,
          requirePositiveDelta,
          statWindow,
        },
      )
    }

    let picked: ReturnType<typeof pickBestStreamerMove> = null
    let rosterDrop: { kind: "player" | "none"; playerId: string | null } = {
      kind: "none",
      playerId: null,
    }

    if (previousId) {
      picked = tryOppMove({ kind: "player", playerId: previousId }, false)
    } else {
      const forcedId = forcedHoleDropBySpot.get(spotIndex)
      if (forcedId) {
        const forcedPick = tryOppMove(
          { kind: "player", playerId: forcedId },
          false,
        )
        if (forcedPick) {
          picked = forcedPick
          rosterDrop = { kind: "player", playerId: forcedId }
        }
      }
      if (!picked && hasOpenNonIlSlot(oppEntries)) {
        picked = tryOppMove({ kind: "none", playerId: null }, false)
      } else if (!picked) {
        for (const dropId of rankRosterDropPlayerIds(
          oppEntries,
          playersById,
          date,
          schedule,
          weakCats,
          weekDropped,
          adpByPlayerId,
          injuryOutDaysByPlayerId,
          board,
          false,
          true,
          statWindow,
        )) {
          const result = tryOppMove({ kind: "player", playerId: dropId }, true)
          if (!result) continue
          picked = result
          rosterDrop = { kind: "player", playerId: dropId }
          break
        }
      }
    }

    if (picked) {
      workingDaily = picked.nextDaily
      occupants[spotIndex] = picked.playerId
      justAdded = picked.playerId
      justDropped =
        previousId ??
        (rosterDrop.kind === "player" ? rosterDrop.playerId : null)
      droppedBySpot.set(spotIndex, justDropped)
      nextAddsUsed += 1
      addIndexBySpot.set(spotIndex, nextAddsUsed)
      takenToday.add(picked.playerId)
      if (justDropped) onDropped?.(justDropped, date)
      if (rosterDrop.kind === "player" && rosterDrop.playerId) {
        weekDropped.add(rosterDrop.playerId)
        rosterDroppedSpots.add(spotIndex)
      }
    } else {
      occupants[spotIndex] = null
      if (previousId) onDropped?.(previousId, date)
    }
  }

  for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
    if (nextAddsUsed >= addLimit) break
    const heldId = occupants[spotIndex]
    if (!heldId) continue
    const held = playersById.get(heldId)
    if (!held) continue
    if (playsOn(held, date, schedule)) continue
    if (remainingGameDays(held, date, schedule) <= 0) continue

    const occupantIds = new Set(
      occupants.filter((id): id is string => Boolean(id)),
    )
    const leftoverIds = candidateIds.filter((id) => {
      if (takenToday.has(id) || occupantIds.has(id)) return false
      const player = playersById.get(id)
      return Boolean(player && playsOn(player, date, schedule))
    })
    if (leftoverIds.length === 0) continue
    const picked = pickBestStreamerMove(
      leftoverIds,
      workingDaily,
      date,
      { kind: "player", playerId: heldId },
      players,
      schedule,
      board,
      isCompatibleAlternative,
      {
        recipes,
        oppDaily: youWorkingDaily,
        requirePositiveDelta: false,
        statWindow,
      },
    )
    if (!picked) continue
    workingDaily = picked.nextDaily
    occupants[spotIndex] = picked.playerId
    justAdded = picked.playerId
    justDropped = heldId
    droppedBySpot.set(spotIndex, heldId)
    nextAddsUsed += 1
    addIndexBySpot.set(spotIndex, nextAddsUsed)
    takenToday.add(picked.playerId)
    onDropped?.(heldId, date)
  }

  const playingOccupant = occupants.find((id) => {
    if (!id) return false
    const player = playersById.get(id)
    return Boolean(player && playsOn(player, date, schedule))
  })
  const streamerPlayerId = playingOccupant ?? justAdded ?? null
  const cells: OpponentStreamDayCell[] = []
  for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
    const nextId = occupants[spotIndex] ?? null
    const prevId = previousOccupants[spotIndex] ?? null
    if (nextId && nextId === prevId) {
      cells.push({
        spotIndex,
        playerId: nextId,
        droppedPlayerId: null,
        action: "hold",
        addIndex: null,
      })
      continue
    }
    if (nextId) {
      const dropped = droppedBySpot.get(spotIndex) ?? prevId ?? null
      cells.push({
        spotIndex,
        playerId: nextId,
        droppedPlayerId: dropped,
        action: prevId && prevId !== nextId ? "drop_add" : "add",
        addIndex: addIndexBySpot.get(spotIndex) ?? null,
      })
      continue
    }
    cells.push({
      spotIndex,
      playerId: null,
      droppedPlayerId: null,
      action: "empty",
      addIndex: null,
    })
  }

  return {
    streamerPlayerId,
    droppedPlayerId:
      streamerPlayerId && streamerPlayerId === justAdded ? justDropped : null,
    cells,
    rosterGameCount: rosterGameCountForDate(
      workingDaily,
      date,
      playersById,
      schedule,
    ),
    addsUsed: nextAddsUsed,
    workingDaily,
  }
}

export const buildStreamingPlan = ({
  spotCount,
  state,
  schedule,
  board,
  addLimit: addLimitInput,
  strategyMode: inputStrategy,
  adpByPlayerId,
  injuryOutDaysByPlayerId,
  forcedRosterDrops,
  forcedOpponentRosterDrops,
  daily,
  waiverPeriodDays: waiverPeriodDaysInput,
  winnerStreamRecipes = [],
  today,
  oppSpotCount,
  opponentTeamIndex,
  youIdle = false,
  statWindow: inputStatWindow,
}: BuildStreamingPlanInput): StreamingPlan => {
  const window = inputStatWindow ?? "season"
  const addLimit = addLimitInput ?? streamingAddLimitForSchedule(schedule)
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
  const didProtectDrops = false
  const days: StreamingPlanDay[] = []
  const weekDroppedPlayers = new Set<string>()
  const releasedStreamerIds = new Set<string>()
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
  const previewBaseDaily: DailyLineups = Object.fromEntries(
    Object.entries(workingDaily).map(([day, entries]) => [
      day,
      entries.map((entry) => ({ ...entry })),
    ]),
  )
  const oppTeam =
    typeof opponentTeamIndex === "number"
      ? state.teams.find((team) => team.teamIndex === opponentTeamIndex)
      : state.teams.find((_, index) => index !== state.perspectiveTeamIndex)
  let oppWorkingDaily: DailyLineups = oppSpotCount
    ? initDailyLineups(
        schedule.matchup.days,
        oppTeam?.entries ?? [],
        rosterSlots,
        state.players,
        schedule,
      )
    : {}
  const oppOccupants: (string | null)[] = Array.from(
    { length: oppSpotCount ?? 0 },
    () => null,
  )
  let oppAddsUsed = 0
  const oppWeekDropped = new Set<string>()
  const oppRosterDroppedSpots = new Set<number>()
  const opponentDays: OpponentStreamDay[] = []
  const ourPickOptions = (
    requirePositiveDelta?: boolean,
    extras?: { requirePositiveContestedDelta?: boolean },
  ) => {
    const options: {
      requirePositiveDelta?: boolean
      requirePositiveContestedDelta?: boolean
      recipes: WinnerStreamRecipe[]
      oppDaily?: DailyLineups
      statWindow?: StatWindow
    } = { recipes: winnerStreamRecipes, statWindow: window }
    if (requirePositiveDelta === false) {
      options.requirePositiveDelta = false
    }
    if (extras?.requirePositiveContestedDelta) {
      options.requirePositiveContestedDelta = true
    }
    if (oppSpotCount) {
      options.oppDaily = oppWorkingDaily
    }
    return options
  }
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
      youTotalsFromDaily(beforeDaily, state.players, schedule, window),
      opp,
      categoryIds,
    )
    const after = buildMatchupBoard(
      youTotalsFromDaily(afterDaily, state.players, schedule, window),
      opp,
      categoryIds,
    )
    return targetCategoryIdsFromBoards(before, after)
  }
  const clearPlannedOccupant = (playerId: string, fromDate: string) => {
    releasedStreamerIds.add(playerId)
    for (const day of schedule.matchup.days) {
      if (day < fromDate) continue
      workingDaily[day] = (workingDaily[day] ?? []).map((entry) =>
        entry.playerId === playerId ? { ...entry, playerId: null } : entry,
      )
    }
  }

  for (const [dayIndex, date] of schedule.matchup.days.entries()) {
    const cells: (StreamingPlanDayCell | null)[] = Array.from(
      { length: spotCount },
      () => null,
    )
    const seatedToday = new Set<string>()
    if (oppSpotCount) {
      for (const id of oppOccupants) {
        if (id) seatedToday.add(id)
      }
    }
    const previousOccupants = [...occupants]
    const forceFillForSpot = (spotIndex: number): boolean => {
      if (date !== today) return false
      const forced = forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)]
      return (
        forced === "open_slot" ||
        (typeof forced === "string" && forced !== "hold")
      )
    }
    const holeByDate = Object.fromEntries(
      schedule.matchup.days.map((day) => [
        day,
        buildHoleDayLineup({
          day,
          teamEntries: youTeam?.entries ?? [],
          players: state.players,
          schedule,
          cutPlayerIds: weekDroppedPlayers,
          savedDay: daily?.[day],
          rosterSlots,
        }),
      ]),
    )
    const holeLineup = holeByDate[date] ?? []
    const holeCount = countOpenActiveSlots(holeLineup)
    const streamerCap = Math.min(spotCount, holeCount)
    const rankAllYouCandidates = (
      candidateIds: string[],
      targetWeakCats = weakCats,
    ): SeasonPlayer[] =>
      rankHoleEligibleFas(
        candidateIds
          .map((id) => playersById.get(id))
          .filter((player): player is SeasonPlayer => Boolean(player)),
        date,
        schedule,
        targetWeakCats,
        seatedToday,
        holeByDate,
        window,
      )

    const rankYouCandidates = (
      candidateIds: string[],
      targetWeakCats = weakCats,
    ) => {
      const ranked = rankAllYouCandidates(candidateIds, targetWeakCats)
      return topHoleTierIds(ranked, date, schedule, holeByDate)
    }

    if (youIdle) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
        occupants[spotIndex] = null
        cells[spotIndex] = {
          spotIndex,
          playerId: null,
          action: "empty",
          droppedPlayerId: null,
          rosterDropPlayerId: null,
          rosterDropKind: "none",
          addIndex: null,
          alternativePlayerIds: [],
          targetCategoryIds: [],
        }
      }
    } else if (holeCount === 0) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
        const previousId = occupants[spotIndex]
        if (previousId) {
          markDropped(previousId, date)
          clearPlannedOccupant(previousId, date)
        }
        occupants[spotIndex] = null
        cells[spotIndex] = {
          spotIndex,
          playerId: null,
          action: "empty",
          droppedPlayerId: null,
          rosterDropPlayerId: null,
          rosterDropKind: "none",
          addIndex: null,
          alternativePlayerIds: [],
          targetCategoryIds: [],
        }
      }
    } else {
    // Pass 1: keep streamers who still have games left this week (hold through
    // off nights). 1-spot always frees off nights. 2/3-spot frees an off night
    // when a today FA can sit more remaining games than the occupant.
    const afterDrop: (string | null)[] = occupants.map((playerId, spotIndex) => {
      if (spotIndex >= streamerCap) {
        if (playerId) clearPlannedOccupant(playerId, date)
        return null
      }
      if (!playerId) return null
      const player = playersById.get(playerId)
      if (
        !player ||
        !playsOn(player, date, schedule) ||
        !playerHasEligibleHole(player, holeLineup) ||
        remainingGameDays(player, date, schedule) <= 0
      ) {
        clearPlannedOccupant(playerId, date)
        return null
      }
      return playerId
    })

    const needFill: number[] = []
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
      const heldId = afterDrop[spotIndex]
      if (
        heldId &&
        !forceFillForSpot(spotIndex) &&
        seatStreamerIfOpen(
          holeLineup,
          heldId,
          date,
          playersById,
          schedule,
        )
      ) {
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
        if (spotIndex >= streamerCap) {
          occupants[spotIndex] = null
          cells[spotIndex] = {
            spotIndex,
            playerId: null,
            action: "empty",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "none",
            addIndex: null,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          }
          continue
        }
        needFill.push(spotIndex)
      }
    }

    // Pace only early swaps on 2/3-spot; empty fills always spend weekly budget.
    // When behind on finishing addLimit, raise swap pace and loosen swap gates.
    const remainingDays = dayCount - dayIndex
    const remainingAdds = addLimit - addsUsed
    const budgetBehind = isAddBudgetBehind(remainingAdds, remainingDays)
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

    const reservedForcedDrops = new Set<string>()
    const forcedPlayerBySpot = new Map<number, string>()
    for (const spotIndex of [...needFill].sort((left, right) => left - right)) {
      const forced = forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)]
      if (
        typeof forced === "string" &&
        forced !== "open_slot" &&
        forced !== "hold" &&
        isValidForcedPlayerDrop(
          forced,
          youTeam?.entries ?? [],
          playersById,
          new Set([...weekDroppedPlayers, ...reservedForcedDrops]),
        )
      ) {
        reservedForcedDrops.add(forced)
        forcedPlayerBySpot.set(spotIndex, forced)
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
          budgetBehind,
          window,
        )
        const candidatePoolIds =
          rankedBlocks.length > 0
            ? rankedBlocks.map((block) => block.playerId)
            : budgetBehind || allowsThinFill(strategyMode, dayIndex, dayCount)
              ? addableFreeAgents(date).map((player) => player.id)
              : []
        const allRankedCandidateIds = onlyAddable(
          rankAllYouCandidates(candidatePoolIds).map((player) => player.id),
          date,
        )
        const candidateIds = rankYouCandidates(candidatePoolIds)
        const addableIds = onlyAddable(candidateIds, date)
        const tryMove = (
          drop: StreamerMoveDrop,
          requirePositiveDelta: boolean,
        ) => {
          const skipBecauseFull =
            drop.kind === "none" &&
            isDailyLineupFullForDate(workingDaily, date, playersById, schedule)
          if (addableIds.length === 0 || skipBecauseFull) return null
          return pickBestStreamerMove(
            addableIds,
            workingDaily,
            date,
            drop,
            state.players,
            schedule,
            board,
            isCompatibleAlternative,
            ourPickOptions(requirePositiveDelta ? undefined : false),
          )
        }

        let picked: ReturnType<typeof pickBestStreamerMove> = null
        let rosterDrop:
          | {
              kind: StreamingPlanRosterDropKind
              playerId: string | null
              didProtect: boolean
            }
          | undefined

        if (previousId && !forceFill) {
          picked = tryMove({ kind: "player", playerId: previousId }, false)
        } else if (forced === "open_slot" && hasOpenNonIlSlot(youTeam?.entries ?? [])) {
          rosterDrop = { kind: "open_slot", playerId: null, didProtect: false }
          picked = tryMove({ kind: "none", playerId: null }, false)
        } else if (forcedPlayerBySpot.has(spotIndex)) {
          const forcedId = forcedPlayerBySpot.get(spotIndex)!
          rosterDrop = { kind: "player", playerId: forcedId, didProtect: false }
          picked = tryMove({ kind: "player", playerId: forcedId }, false)
          if (!picked) reservedForcedDrops.delete(forcedId)
        } else if (addableIds.some((id) => releasedStreamerIds.has(id))) {
          const releasedIds = addableIds.filter((id) =>
            releasedStreamerIds.has(id),
          )
          picked = pickBestStreamerMove(
            releasedIds,
            workingDaily,
            date,
            { kind: "none", playerId: null },
            state.players,
            schedule,
            board,
            isCompatibleAlternative,
            ourPickOptions(false),
          )
        } else if (hasOpenNonIlSlot(youTeam?.entries ?? [])) {
          rosterDrop = { kind: "open_slot", playerId: null, didProtect: false }
          picked = tryMove({ kind: "none", playerId: null }, false)
        } else {
          const unavailableDropIds = new Set([
            ...weekDroppedPlayers,
            ...reservedForcedDrops,
          ])
          const dropId = pickAutoRosterCut({
            date,
            days: schedule.matchup.days,
            teamEntries: (youTeam?.entries ?? []).map((entry) =>
              entry.playerId && unavailableDropIds.has(entry.playerId)
                ? { ...entry, playerId: null }
                : entry,
            ),
            players: state.players,
            schedule,
            seatedTonight: holeLineup,
          })
          if (dropId) {
            const result = tryMove({ kind: "player", playerId: dropId }, true)
            if (result) {
              picked = result
              rosterDrop = {
                kind: "player",
                playerId: dropId,
                didProtect: false,
              }
            }
          }
        }

        if (picked) {
          targetCategoryIds = targetCatsFromMove(workingDaily, picked.nextDaily)
          workingDaily = picked.nextDaily
          playerId = picked.playerId
          alternativePlayerIds = allRankedCandidateIds
            .filter((candidateId) => candidateId !== picked.playerId)
            .filter((candidateId) =>
              isCompatibleAlternative(picked.playerId, candidateId),
            )
            .slice(0, 3)
          if (previousId && !forceFill) {
            action = "drop_add"
            droppedPlayerId = previousId
          } else {
            action = "add"
            if (rosterDrop) {
              rosterDropKind = rosterDrop.kind
              rosterDropPlayerId = rosterDrop.playerId
            }
          }
          addsUsed += 1
          addsBySpot[spotIndex]! += 1
          addIndex = addsUsed
          releasedStreamerIds.delete(picked.playerId)
          seatedToday.add(picked.playerId)
          seatStreamerIfOpen(
            holeLineup,
            picked.playerId,
            date,
            playersById,
            schedule,
          )
          if (previousId && !forceFill) markDropped(previousId, date)
          if (rosterDrop?.kind === "player" && rosterDrop.playerId) {
            weekDroppedPlayers.add(rosterDrop.playerId)
            markDropped(rosterDrop.playerId, date)
          }
        }
      }

      if (!playerId && previousId) {
        const previous = playersById.get(previousId)
        if (
          previous &&
          playsOn(previous, date, schedule) &&
          playerHasEligibleHole(previous, holeLineup) &&
          remainingGameDays(previous, date, schedule) > 0
        ) {
          if (
            seatStreamerIfOpen(
              holeLineup,
              previousId,
              date,
              playersById,
              schedule,
            )
          ) {
            action = "hold"
            playerId = previousId
            seatedToday.add(previousId)
          }
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
        alternativePlayerIds,
        targetCategoryIds,
      }
    }

    // Early swap: keep density / multi-spot off-night when-gates; score by board.
    const isLateWeek = dayIndex >= Math.max(0, dayCount - 3)
    const liveBoard = matchupBoardFromDaily(
      workingDaily,
      state.players,
      schedule,
      board,
      oppSpotCount ? oppWorkingDaily : undefined,
      window,
    )
    const hasCloseLoss = liveBoard.categories.some(isCloseLosingCategory)
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
        budgetBehind,
        window,
      )
      let candidateIds = rankedBlocks.map((block) => block.playerId)
      if (
        isOneSpotOffNight ||
        (candidateIds.length === 0 &&
          ((isMultiSpotOffNight && (isLateWeek || budgetBehind)) ||
            (budgetBehind && heldPlaysToday)))
      ) {
        const todayFaIds = rankYouCandidates(
          addableFreeAgents(date).map((player) => player.id),
        )
        candidateIds = [...new Set([...candidateIds, ...todayFaIds])]
      }

      const heldSeatable = remainingSeatableGameDays(
        occupant,
        date,
        schedule,
        workingDaily,
        playersById,
      )
      const todayBlock = rankedBlocks[0] ?? null
      const volumeUpgradeIds = candidateIds.filter((upgradeId) => {
        const upgradePlayer = playersById.get(upgradeId)
        if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) {
          return false
        }
        return (
          remainingSeatableGameDays(
            upgradePlayer,
            date,
            schedule,
            workingDaily,
            playersById,
          ) > heldSeatable
        )
      })
      const hasVolumeUpgrade = volumeUpgradeIds.length > 0

      if (isMultiSpotOffNight) {
        if (todayBlock == null) {
          if (!(isLateWeek || budgetBehind || hasVolumeUpgrade)) continue
        } else if (
          !hasVolumeUpgrade &&
          !allowsMultiSpotOffNightUpgrade(
            todayBlock.tier,
            dayIndex,
            dayCount,
            budgetBehind,
          )
        ) {
          continue
        }
      } else if (heldPlaysToday && !budgetBehind) {
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
      } else if (heldPlaysToday && budgetBehind) {
        const todayIds = rankYouCandidates(
          addableFreeAgents(date).map((player) => player.id),
        )
        candidateIds = [...new Set([...candidateIds, ...todayIds])]
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
      candidateIds = rankYouCandidates(candidateIds)
      if (isMultiSpotOffNight && hasVolumeUpgrade) {
        const volumeSet = new Set(volumeUpgradeIds)
        candidateIds = candidateIds.filter((upgradeId) => volumeSet.has(upgradeId))
      }

      let picked =
        candidateIds.length === 0
          ? null
          : pickBestStreamerMove(
              candidateIds,
              workingDaily,
              date,
              { kind: "player", playerId: cell.playerId },
              state.players,
              schedule,
              board,
              isCompatibleAlternative,
              ourPickOptions(
                isOneSpotOffNight || (isMultiSpotOffNight && hasVolumeUpgrade)
                  ? false
                  : undefined,
              ),
            )

      if (!picked && spotCount === 1 && heldPlaysToday && hasCloseLoss) {
        const closeLossCats = liveBoard.categories
          .filter(isCloseLosingCategory)
          .map((row) => row.categoryId)
        const heldCloseScore = weakCatScore(occupant, closeLossCats, window)
        const chaseIds = onlyAddable(
          rankYouCandidates(
            addableFreeAgents(date).map((player) => player.id),
            closeLossCats,
          )
            .filter((upgradeId) => {
              const upgradePlayer = playersById.get(upgradeId)
              return Boolean(
                upgradePlayer &&
                  playsOn(upgradePlayer, date, schedule) &&
                  remainingGameDays(upgradePlayer, date, schedule) > 0 &&
                  weakCatScore(upgradePlayer, closeLossCats, window) >
                    heldCloseScore,
              )
            }),
          date,
        )
        picked = pickBestStreamerMove(
          chaseIds,
          workingDaily,
          date,
          { kind: "player", playerId: cell.playerId },
          state.players,
          schedule,
          board,
          isCompatibleAlternative,
          ourPickOptions(false, { requirePositiveContestedDelta: true }),
        )
      }
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
    }

    const dayCells = cells.map((cell) => cell!)

    if (oppSpotCount) {
      const takenToday = new Set<string>(seatedToday)
      for (const cell of dayCells) {
        if (cell.playerId) takenToday.add(cell.playerId)
      }
      const candidateIds = addableFreeAgents(date).map((entry) => entry.id)
      const filled = fillOpponentSpotsForDate({
        date,
        spotCount: oppSpotCount,
        occupants: oppOccupants,
        oppWorkingDaily,
        youWorkingDaily: workingDaily,
        oppEntries: oppTeam?.entries ?? [],
        rosterSlots,
        takenToday,
        addLimit,
        addsUsed: oppAddsUsed,
        weekDropped: oppWeekDropped,
        rosterDroppedSpots: oppRosterDroppedSpots,
        playersById,
        players: state.players,
        schedule,
        weakCats,
        board,
        recipes: winnerStreamRecipes,
        adpByPlayerId,
        injuryOutDaysByPlayerId,
        forcedOpponentRosterDrops,
        isCompatibleAlternative,
        candidateIds,
        onDropped: markDropped,
        statWindow: window,
      })
      oppWorkingDaily = filled.workingDaily
      oppAddsUsed = filled.addsUsed
      opponentDays.push({
        date,
        streamerPlayerId: filled.streamerPlayerId,
        droppedPlayerId: filled.droppedPlayerId,
        rosterGameCount: filled.rosterGameCount,
        cells: filled.cells,
      })
    }

    days.push({ date, cells: dayCells })
  }

  const plan: StreamingPlan = {
    spotCount,
    addLimit,
    addsUsed,
    gameStarts: 0,
    strategyMode,
    suggestedStrategyMode,
    summaryReasons: buildSummaryReasons(
      strategyMode,
      suggestedStrategyMode,
      didProtectDrops,
    ),
    days,
    opponentDays: oppSpotCount
      ? opponentDays
      : schedule.matchup.days.map((date) => ({
          date,
          streamerPlayerId: null,
          droppedPlayerId: null,
          rosterGameCount: 0,
          cells: [],
        })),
    opponentDaily: oppSpotCount ? oppWorkingDaily : {},
  }
  plan.gameStarts = countTeamStarts(
    applyStreamingPlanPreview(
      previewBaseDaily,
      plan,
      playersById,
      schedule,
    ),
    state.players,
    schedule,
  )
  return plan
}

export const buildAllStreamingPlans = (
  input: Omit<BuildStreamingPlanInput, "spotCount">,
): StreamingPlan[] =>
  ([1, 2, 3] as const).map((spotCount) =>
    buildStreamingPlan({ ...input, spotCount }),
  )
