import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { MATCHUP_CATEGORY_SIGMOID_SCALE, STREAMING_PROTECTED_ADP_MAX, SURPLUS_WIN_PROB } from "./constants"
import { streamingAddLimitForSchedule } from "./games"
import {
  filterStreamAddPool,
  isStreamAddEligibleOnDate,
} from "./streamingAddEligibility"
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
  chaseCategoryIds,
  CONTESTED_WIN_PROB_MAX,
  isCloseLosingCategory,
  targetCategoryIdsFromBoards,
} from "./streamingDropExplain"
import {
  mergeStreamingPuntIds,
  seasonLeakCategoryIds,
  shiftMatchupBoardByOpponentDelta,
  streamingChaseNote,
} from "./chasePair"
import type { StatPairRow } from "@/lib/players/statPairCorrelation"
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
  WinnerStreamRecipe,
} from "./types"
import {
  findStreamingBlocks,
  type StreamingBlock,
} from "./streamingBlocks"
import {
  chooseIlVersusNewInjuredDrop,
  compareAddTiebreak,
  compareDropPriority,
  expectedWinsAdded,
  isAdpProtected,
  isLongTermInjuryException,
} from "./streamingDropPolicy"
import {
  addCapForSpot,
  allowsEarlySwap,
  allowsMultiSpotEarlySwap,
  allowsThinFill,
  canSpotSpendAdd,
  dailyAddPaceLimit,
  densityTierRank,
} from "./streamingStrategy"
import { weeklyPlayerStats } from "./weekly"
import { playerHasGameOnDate } from "./games"
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
  holeWindowTier,
  nextHoleStartDate,
} from "./streamingHoleCalendar"
import { applyStreamingPlanPreview } from "./applyStreamingPlanPreview"
import type { StreamingAddLock } from "./streamingAddOverride"

const FG_PCT_REPLACEMENT = 0.47
const FT_PCT_REPLACEMENT = 0.78

export type BuildStreamingPlanInput = {
  spotCount: StreamingPlanSpotCount
  state: SeasonLeagueState
  schedule: ScheduleResponse
  board: MatchupBoard
  addLimit?: number
  adpByPlayerId?: Record<string, number>
  injuryOutDaysByPlayerId?: Record<string, number>
  forcedRosterDrops?: Record<string, string | "open_slot" | "hold">
  /**
   * Opp spotIndex → roster player id to cut the first time that spot
   * needs a roster drop. `null` / omitted = Auto. Mapped onto the same
   * planner `forcedRosterDrops` the user plan uses.
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
  /** Skip you adds/holds so opponent streaming uses the same planner on the full FA pool. */
  youIdle?: boolean
  statWindow?: StatWindow
  /** This-matchup punt toggles. Unioned with categories whose weight is already 0. */
  puntCategoryIds?: readonly CategoryId[]
  /** Loaded once per matchup. Not read again per add candidate. */
  statPairs?: readonly StatPairRow[]
  forcedAdds?: readonly StreamingAddLock[]
  /**
   * Roster ids the planner may cut. When set, ADP protection is replaced
   * by this allowlist. Omitted = existing ADP floor.
   */
  droppablePlayerIds?: ReadonlySet<string>
}

export const streamingAddDropKey = (date: string, spotIndex: number) =>
  `${date}:${spotIndex}`

const weakCategories = (
  board: MatchupBoard,
  puntCategoryIds: ReadonlySet<CategoryId> = new Set(),
): CategoryId[] => chaseCategoryIds(board, puntCategoryIds)

const flippedMatchupBoard = (board: MatchupBoard): MatchupBoard => {
  const categories = board.categories.map((row) => ({
    ...row,
    you: row.opp,
    opp: row.you,
    outcome:
      row.outcome === "W" ? "L" : row.outcome === "L" ? "W" : ("T" as const),
    winProb: 1 - row.winProb,
  }))
  return {
    categories,
    wins: board.losses,
    losses: board.wins,
    ties: board.ties,
    projectedCatWins: categories.reduce((sum, row) => sum + row.winProb, 0),
  }
}

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
  return categoryContribution(player, games, categoryId, window)
}

const scaledCatHelp = (
  player: SeasonPlayer,
  categoryId: CategoryId,
  window: StatWindow = "season",
): number => {
  const scale = MATCHUP_CATEGORY_SIGMOID_SCALE[categoryId]
  return weakCatHelp(player, 1, categoryId, window) / scale
}

const weakCatScore = (
  player: SeasonPlayer,
  weakCats: CategoryId[],
  window: StatWindow = "season",
): number =>
  weakCats.reduce(
    (sum, categoryId) => sum + scaledCatHelp(player, categoryId, window),
    0,
  )

const playsOn = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
): boolean => playerHasGameOnDate(player, date, schedule)

/** 1-spot holds only the add day. 2-spot and 3-spot hold the block through its last game. */
export const streamingHoldUntil = (
  player: SeasonPlayer,
  fromDate: string,
  spots: number,
  schedule: ScheduleResponse,
): string => {
  const windowDays = schedule.matchup.days
    .filter((day) => day >= fromDate)
    .slice(0, 4)
  const games = windowDays.filter((day) => playsOn(player, day, schedule))
  if (spots <= 1) return fromDate
  return games[games.length - 1] ?? fromDate
}

const remainingGameDays = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
): number => {
  const remaining = schedule.matchup.days.filter((day) => day >= fromDate)
  return remaining.filter((day) => playsOn(player, day, schedule)).length
}

/**
 * True while the next hole start is tomorrow or the day after.
 * A packed next game does not count — that is not a 2-in-3 worth holding.
 */
const isInsideHeldStreamingWindow = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
  holeByDate: Record<string, SeasonRosterEntry[]>,
): boolean => {
  const days = schedule.matchup.days
  const dateIndex = days.indexOf(date)
  if (dateIndex < 0) return false
  const nextHole = nextHoleStartDate(
    player,
    date,
    days,
    holeByDate,
    schedule,
  )
  if (!nextHole) return false
  const nextIndex = days.indexOf(nextHole)
  if (nextIndex < 0) return false
  return nextIndex - dateIndex <= 2
}

type SpotBlockAssignment = {
  playerId: string
  startDate: string
  lastGameDate: string
  gameDates: string[]
}

const lastGameDateOf = (block: StreamingBlock): string =>
  block.gameDates[block.gameDates.length - 1] ?? block.startDate

const assignSpotBlockTimelines = (
  spotCount: number,
  addLimit: number,
  blocks: StreamingBlock[],
  days: string[],
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
  holeByDate: Record<string, SeasonRosterEntry[]>,
  schedule: ScheduleResponse,
  window: StatWindow,
): SpotBlockAssignment[][] => {
  const timelines: SpotBlockAssignment[][] = Array.from(
    { length: spotCount },
    () => [],
  )
  const startedOn = new Set<string>()
  const takenPlayers = new Set<string>()
  let assignedAdds = 0

  const holeNeedByDate = Object.fromEntries(
    days.map((day) => [day, countOpenActiveSlots(holeByDate[day] ?? [])]),
  )

  const nextStartForSpot = (spotIndex: number): string => {
    const previous = timelines[spotIndex]!.at(-1)
    if (!previous) return days[0]!
    const previousIndex = days.indexOf(previous.lastGameDate)
    const afterHold = days[previousIndex + 1]
    return afterHold ?? days[days.length - 1]!
  }

  const coveredDates = () => {
    const covered = new Set<string>()
    for (const timeline of timelines) {
      for (const assignment of timeline) {
        for (const gameDate of assignment.gameDates) covered.add(gameDate)
      }
    }
    return covered
  }

  const coverCountByDate = () => {
    const counts: Record<string, number> = {}
    for (const timeline of timelines) {
      for (const assignment of timeline) {
        for (const gameDate of assignment.gameDates) {
          counts[gameDate] = (counts[gameDate] ?? 0) + 1
        }
      }
    }
    return counts
  }

  const scoreBlock = (
    block: StreamingBlock,
    covered: Set<string>,
    minStart: string,
    spotIsEmpty: boolean,
  ) => {
    const player = playersById.get(block.playerId)
    if (!player) return Number.NEGATIVE_INFINITY
    const starts = remainingHoleStarts(
      player,
      block.startDate,
      days,
      holeByDate,
      schedule,
    )
    const newCover = block.gameDates.filter((gameDate) => !covered.has(gameDate))
      .length
    const startIndex = days.indexOf(block.startDate)
    const minIndex = days.indexOf(minStart)
    const firstUncovered = days.find((day) => !covered.has(day))
    const skipPenalty = Math.max(0, startIndex - minIndex) * 1000
    const sameDayPenalty =
      startedOn.has(block.startDate) && !spotIsEmpty ? 4000 : 0
    const coversFirstHole =
      firstUncovered && block.startDate === firstUncovered ? 50000 : 0
    const skipsFirstHole =
      firstUncovered && block.startDate > firstUncovered ? 30000 : 0
    if (spotCount >= 3) {
      const covers = coverCountByDate()
      const remainingHolesOn = (date: string) =>
        Math.max(
          0,
          Math.min(holeNeedByDate[date] ?? 0, spotCount) - (covers[date] ?? 0),
        )
      let emptyDaysCovered = 0
      let continuationDays = 0
      for (const date of block.gameDates) {
        if (date < minStart) continue
        if (remainingHolesOn(date) <= 0) continue
        emptyDaysCovered += 1
        if (date > block.startDate) continuationDays += 1
      }
      const earliestEmpty = days.find(
        (day) => day >= minStart && remainingHolesOn(day) > 0,
      )
      const startsOnEarliestEmpty =
        earliestEmpty != null && block.startDate === earliestEmpty ? 1 : 0
      return (
        startsOnEarliestEmpty * 100_000_000 +
        emptyDaysCovered * 1_000_000 +
        weakCatScore(player, weakCats, window) * 100 +
        densityTierRank(block.tier) +
        continuationDays * 0.01 -
        sameDayPenalty * 0.001
      )
    }
    return (
      newCover * 10000 +
      coversFirstHole +
      (block.startDate === minStart ? 8000 : 0) +
      starts * 100 +
      densityTierRank(block.tier) * 10 +
      weakCatScore(player, weakCats, window) -
      skipPenalty -
      sameDayPenalty -
      skipsFirstHole
    )
  }

  while (assignedAdds < addLimit) {
    const covered = coveredDates()
    let best: {
      spotIndex: number
      block: StreamingBlock
      score: number
    } | null = null
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
      const minStart = nextStartForSpot(spotIndex)
      for (const block of blocks) {
        if (block.startDate < minStart) continue
        if (takenPlayers.has(block.playerId)) continue
        const score = scoreBlock(
          block,
          covered,
          minStart,
          timelines[spotIndex]!.length === 0,
        )
        if (
          !best ||
          score > best.score ||
          (score === best.score &&
            (block.startDate < best.block.startDate ||
              (block.startDate === best.block.startDate &&
                spotIndex < best.spotIndex)))
        ) {
          best = { spotIndex, block, score }
        }
      }
    }
    if (!best) break
    timelines[best.spotIndex]!.push({
      playerId: best.block.playerId,
      startDate: best.block.startDate,
      lastGameDate: lastGameDateOf(best.block),
      gameDates: best.block.gameDates,
    })
    startedOn.add(best.block.startDate)
    takenPlayers.add(best.block.playerId)
    assignedAdds += 1
  }
  return timelines
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
  if (chosenFamily === "guard") return candidateFamily === "guard"
  if (candidateFamily === "guard") return true
  if (chosenFamily && candidateFamily && chosenFamily !== candidateFamily) {
    return false
  }
  return true
}

const scheduleWindowDates = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
): string[] => {
  const window = schedule.matchup.days.filter((day) => day >= date).slice(0, 4)
  return window.filter((day) => playsOn(player, day, schedule))
}

/** Games inside the next `dayCount` matchup days, starting at `fromDate`. */
const gamesInMatchupDays = (
  player: SeasonPlayer,
  fromDate: string,
  schedule: ScheduleResponse,
  dayCount: number,
): string[] => {
  const window = schedule.matchup.days
    .filter((day) => day >= fromDate)
    .slice(0, dayCount)
  return window.filter((day) => playsOn(player, day, schedule))
}

const scheduleWindowHasB2b = (
  gameDates: string[],
  days: string[],
): boolean => {
  const indices = gameDates
    .map((day) => days.indexOf(day))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] === indices[index - 1]! + 1) return true
  }
  return false
}

const scheduleDensityRank = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
): number => {
  const games = scheduleWindowDates(player, date, schedule)
  if (games.length >= 3) return densityTierRank("elite")
  if (games.length === 2) {
    return scheduleWindowHasB2b(games, schedule.matchup.days)
      ? densityTierRank("strong")
      : densityTierRank("ok")
  }
  if (games.length === 1) return densityTierRank("thin")
  return -1
}

const rankEligibleFas = (
  candidates: SeasonPlayer[],
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  seatedIds: Set<string>,
  _budgetBehind = false,
  window: StatWindow = "season",
  adpByPlayerId?: Record<string, number>,
  board?: MatchupBoard,
): SeasonPlayer[] => {
  const eligible = candidates
    .filter((player) => !seatedIds.has(player.id))
    .filter((player) => playsOn(player, date, schedule))
    .map((player) => ({
      player,
      density: scheduleDensityRank(player, date, schedule),
      starts: scheduleWindowDates(player, date, schedule).length,
      score: weakCatScore(player, weakCats, window),
    }))
    .filter((entry) => entry.starts > 0)
    .sort((left, right) => {
      if (right.density !== left.density) return right.density - left.density
      if (right.starts !== left.starts) return right.starts - left.starts
      if (right.score !== left.score) return right.score - left.score
      return compareAddTiebreak(
        {
          expectedWins: expectedWinsAdded(left.player, left.starts, board, window),
          adp: adpByPlayerId?.[left.player.id],
        },
        {
          expectedWins: expectedWinsAdded(right.player, right.starts, board, window),
          adp: adpByPlayerId?.[right.player.id],
        },
      )
    })

  return eligible.map((entry) => entry.player)
}

const holeDensityRank = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
  holeByDate: Record<string, SeasonRosterEntry[]>,
): number => {
  const tier = holeWindowTier(
    player,
    date,
    schedule.matchup.days,
    holeByDate,
    schedule,
  )
  return tier ? densityTierRank(tier) : -1
}

const rankHoleEligibleFas = (
  candidates: SeasonPlayer[],
  date: string,
  schedule: ScheduleResponse,
  weakCats: CategoryId[],
  seatedIds: Set<string>,
  holeByDate: Record<string, SeasonRosterEntry[]>,
  window: StatWindow = "season",
  adpByPlayerId?: Record<string, number>,
  board?: MatchupBoard,
): SeasonPlayer[] =>
  candidates
    .filter((player) => !seatedIds.has(player.id))
    .filter((player) => playsOn(player, date, schedule))
    .map((player) => ({
      player,
      density: holeDensityRank(player, date, schedule, holeByDate),
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
    }))
    .filter((entry) => entry.starts > 0)
    .sort((left, right) => {
      if (right.density !== left.density) return right.density - left.density
      if (right.starts !== left.starts) return right.starts - left.starts
      if (right.b2bPairs !== left.b2bPairs) return right.b2bPairs - left.b2bPairs
      if (right.score !== left.score) return right.score - left.score
      return compareAddTiebreak(
        {
          expectedWins: expectedWinsAdded(left.player, left.starts, board, window),
          adp: adpByPlayerId?.[left.player.id],
        },
        {
          expectedWins: expectedWinsAdded(right.player, right.starts, board, window),
          adp: adpByPlayerId?.[right.player.id],
        },
      )
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
  const winnerDensity = holeDensityRank(winner, date, schedule, holeByDate)
  return ranked
    .filter(
      (player) =>
        holeDensityRank(player, date, schedule, holeByDate) === winnerDensity,
    )
    .map((player) => player.id)
}

const compareBlocks = (
  left: StreamingBlock,
  right: StreamingBlock,
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
  _budgetBehind = false,
  window: StatWindow = "season",
  adpByPlayerId?: Record<string, number>,
  board?: MatchupBoard,
): number => {
  const leftPlayer = playersById.get(left.playerId)
  const rightPlayer = playersById.get(right.playerId)
  const leftScore = leftPlayer ? weakCatScore(leftPlayer, weakCats, window) : 0
  const rightScore = rightPlayer
    ? weakCatScore(rightPlayer, weakCats, window)
    : 0
  const tierDelta = densityTierRank(right.tier) - densityTierRank(left.tier)
  if (tierDelta !== 0) return tierDelta
  if (right.gamesInWindow !== left.gamesInWindow) {
    return right.gamesInWindow - left.gamesInWindow
  }
  if (rightScore !== leftScore) return rightScore - leftScore
  return compareAddTiebreak(
    {
      expectedWins: leftPlayer
        ? expectedWinsAdded(leftPlayer, left.gamesInWindow, board, window)
        : 0,
      adp: adpByPlayerId?.[left.playerId],
    },
    {
      expectedWins: rightPlayer
        ? expectedWinsAdded(rightPlayer, right.gamesInWindow, board, window)
        : 0,
      adp: adpByPlayerId?.[right.playerId],
    },
  )
}

const listTodayBlocks = (
  blocks: StreamingBlock[],
  date: string,
  seatedIds: Set<string>,
  playersById: Map<string, SeasonPlayer>,
  weakCats: CategoryId[],
  dayIndex: number,
  dayCount: number,
  budgetBehind = false,
  window: StatWindow = "season",
  adpByPlayerId?: Record<string, number>,
  board?: MatchupBoard,
): StreamingBlock[] => {
  const candidates = blocks
    .filter((block) => block.startDate === date && !seatedIds.has(block.playerId))
    .filter((block) => block.remainingWeekGames > 0)
    .sort((left, right) =>
      compareBlocks(
        left,
        right,
        playersById,
        weakCats,
        budgetBehind,
        window,
        adpByPlayerId,
        board,
      ),
    )

  const denserExists = candidates.some(
    (block) => densityTierRank(block.tier) > densityTierRank("thin"),
  )
  return candidates.filter((block) => {
    if (block.tier === "thin") {
      return allowsThinFill(dayIndex, dayCount, {
        fillsEmptySlot: true,
        noDenserFa: !denserExists,
      })
    }
    return true
  })
}

const buildSummaryReasons = (didProtectDrops: boolean): string[] => {
  const summaryReasons = [
    "Prioritized 3-in-4 / B2B blocks",
    "Fills empty stream spots for the week",
  ]
  if (didProtectDrops) {
    summaryReasons.push(`Protected ADP ≤ ${STREAMING_PROTECTED_ADP_MAX}`)
  }
  return summaryReasons.slice(0, 3)
}

const isIlSlot = (slot: SeasonRosterEntry["slot"]) => slot === "IL"

const hasOpenNonIlSlot = (entries: SeasonRosterEntry[]) =>
  entries.some((entry) => !isIlSlot(entry.slot) && entry.playerId === null)

const entriesWithDroppedOpen = (
  entries: SeasonRosterEntry[],
  droppedIds: Set<string>,
) =>
  entries.map((entry) =>
    entry.playerId && droppedIds.has(entry.playerId)
      ? { ...entry, playerId: null }
      : entry,
  )

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
  allowPlayersWhoPlay = false,
  droppableIds?: ReadonlySet<string>,
): string[] => {
  const outDaysOf = (id: string) => injuryOutDaysByPlayerId?.[id] ?? 0
  const adpOf = (id: string) => adpByPlayerId?.[id] ?? null
  const isCoreRosterHold = (player: SeasonPlayer): boolean => {
    if (droppableIds && !droppableIds.has(player.id)) return true
    if (!protectCoreRoster) return false
    if (!droppableIds && isAdpProtected(adpOf(player.id))) return true
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
    .filter((p) => allowPlayersWhoPlay || !playsOn(p, date, schedule))

  const ilEntry = entries.find((entry) => {
    if (!isIlSlot(entry.slot) || !entry.playerId) return false
    if (alreadyDropped.has(entry.playerId)) return false
    const ilPlayer = playersById.get(entry.playerId)
    if (!ilPlayer || playsOn(ilPlayer, date, schedule)) return false
    return true
  })
  const longTermNonIl = rosteredNonIl.filter((player) =>
    isLongTermInjuryException(outDaysOf(player.id)),
  )
  const ilFirst: string[] = []
  if (ilEntry?.playerId && longTermNonIl.length > 0) {
    const newlyInjured = longTermNonIl.slice().sort((left, right) => {
      const outDelta = outDaysOf(right.id) - outDaysOf(left.id)
      if (outDelta !== 0) return outDelta
      return compareDropPriority(
        {
          games: 0,
          expectedWins: expectedWinsAdded(
            left,
            remainingGameDays(left, date, schedule),
            board,
            window,
          ),
          adp: adpOf(left.id),
        },
        {
          games: 0,
          expectedWins: expectedWinsAdded(
            right,
            remainingGameDays(right, date, schedule),
            board,
            window,
          ),
          adp: adpOf(right.id),
        },
      )
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
        return compareDropPriority(
          {
            games: 0,
            expectedWins: expectedWinsAdded(
              left.player,
              left.volume,
              board,
              window,
            ),
            adp: adpOf(left.player.id),
          },
          {
            games: 0,
            expectedWins: expectedWinsAdded(
              right.player,
              right.volume,
              board,
              window,
            ),
            adp: adpOf(right.player.id),
          },
        )
      }
      if (right.noGame !== left.noGame) return right.noGame - left.noGame
      if (left.volume !== right.volume) return left.volume - right.volume
      if (left.weak !== right.weak) return left.weak - right.weak
      return compareDropPriority(
        {
          games: 0,
          expectedWins: expectedWinsAdded(
            left.player,
            left.volume,
            board,
            window,
          ),
          adp: adpOf(left.player.id),
        },
        {
          games: 0,
          expectedWins: expectedWinsAdded(
            right.player,
            right.volume,
            board,
            window,
          ),
          adp: adpOf(right.player.id),
        },
      )
    })
    .map((entry) => entry.player.id)

  return [...ilFirst, ...ranked]
}

const isValidForcedPlayerDrop = (
  playerId: string,
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  alreadyDropped: Set<string>,
  extraDroppableIds?: ReadonlySet<string>,
): boolean => {
  if (alreadyDropped.has(playerId)) return false
  const onSeasonRoster = entries.some((entry) => entry.playerId === playerId)
  const onStreamRoster = extraDroppableIds?.has(playerId) ?? false
  if (!onSeasonRoster && !onStreamRoster) return false
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
    return playerHasGameOnDate(player, date, schedule)
  }).length
}

const emptyStreamingPlanDays = (
  days: string[],
  spotCount: number,
): StreamingPlanDay[] =>
  days.map((date) => ({
    date,
    cells: Array.from({ length: spotCount }, (_, spotIndex) => ({
      spotIndex,
      playerId: null,
      action: "empty" as const,
      droppedPlayerId: null,
      rosterDropPlayerId: null,
      rosterDropKind: "none" as const,
      addIndex: null,
      alternativePlayerIds: [],
      targetCategoryIds: [],
    })),
  }));

const emptyOpponentDays = (days: string[]): OpponentStreamDay[] =>
  days.map((date) => ({
    date,
    streamerPlayerId: null,
    droppedPlayerId: null,
    rosterGameCount: 0,
    cells: [],
  }));

const opponentDaysFromPlan = (
  plan: StreamingPlan,
  opponentDaily: DailyLineups,
  playersById: Map<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): OpponentStreamDay[] =>
  plan.days.map((day) => {
    const cells: OpponentStreamDayCell[] = day.cells.map((cell) => ({
      spotIndex: cell.spotIndex,
      playerId: cell.playerId,
      droppedPlayerId: cell.droppedPlayerId ?? cell.rosterDropPlayerId,
      action: cell.action,
      addIndex: cell.addIndex,
    }));
    const added = cells.find(
      (cell) => cell.action === "add" || cell.action === "drop_add",
    );
    return {
      date: day.date,
      streamerPlayerId: added?.playerId ?? null,
      droppedPlayerId: added?.droppedPlayerId ?? null,
      rosterGameCount: rosterGameCountForDate(
        opponentDaily,
        day.date,
        playersById,
        schedule,
      ),
      cells,
    };
  });

const forcedRosterDropsFromOpponentCuts = (
  cuts: (string | null)[] | undefined,
  forceDate: string | undefined,
): Record<string, string> | undefined => {
  if (!forceDate || !cuts?.some(Boolean)) return undefined;
  const out: Record<string, string> = {};
  cuts.forEach((playerId, spotIndex) => {
    if (!playerId) return;
    out[streamingAddDropKey(forceDate, spotIndex)] = playerId;
  });
  return out;
};

type OpponentSelfPlan = {
  days: OpponentStreamDay[];
  daily: DailyLineups;
};

const buildOpponentSelfPlan = ({
  oppTeam,
  oppSpotCount,
  state,
  schedule,
  board,
  addLimit,
  adpByPlayerId,
  injuryOutDaysByPlayerId,
  forcedOpponentRosterDrops,
  waiverPeriodDays,
  winnerStreamRecipes,
  today,
  statWindow,
  statPairs,
  playersById,
  rosterSlots,
}: {
  oppTeam: SeasonLeagueState["teams"][number];
  oppSpotCount: 1 | 2 | 3;
  state: SeasonLeagueState;
  schedule: ScheduleResponse;
  board: MatchupBoard;
  addLimit: number;
  adpByPlayerId?: Record<string, number>;
  injuryOutDaysByPlayerId?: Record<string, number>;
  forcedOpponentRosterDrops?: (string | null)[];
  waiverPeriodDays?: number;
  winnerStreamRecipes?: WinnerStreamRecipe[];
  today?: string;
  statWindow?: StatWindow;
  statPairs?: readonly StatPairRow[];
  playersById: Map<string, SeasonPlayer>;
  rosterSlots: SeasonSlot[];
}): OpponentSelfPlan => {
  const forceDate =
    today && schedule.matchup.days.includes(today)
      ? today
      : schedule.matchup.days[0];
  const forcedIds = new Set(
    (forcedOpponentRosterDrops ?? []).filter(
      (id): id is string => Boolean(id),
    ),
  );
  const patchedOppTeam = {
    ...oppTeam,
    entries: oppTeam.entries.map((entry) =>
      entry.playerId && forcedIds.has(entry.playerId)
        ? { ...entry, playerId: null }
        : entry,
    ),
  };
  const buildOne = (spots: 1 | 2 | 3): OpponentSelfPlan => {
    const inner = buildStreamingPlan({
      spotCount: spots,
      state: {
        ...state,
        perspectiveTeamIndex: oppTeam.teamIndex,
        teams: state.teams.map((team) =>
          team.teamIndex === oppTeam.teamIndex ? patchedOppTeam : team,
        ),
      },
      schedule,
      board: flippedMatchupBoard(board),
      addLimit,
      adpByPlayerId,
      injuryOutDaysByPlayerId,
      forcedRosterDrops: forcedRosterDropsFromOpponentCuts(
        forcedOpponentRosterDrops,
        forceDate,
      ),
      waiverPeriodDays,
      winnerStreamRecipes,
      today: forceDate,
      opponentTeamIndex: state.perspectiveTeamIndex,
      statWindow,
      statPairs,
    })
    const daily = applyStreamingPlanPreview(
      initDailyLineups(
        schedule.matchup.days,
        patchedOppTeam.entries,
        rosterSlots,
        state.players,
        schedule,
      ),
      inner,
      playersById,
      schedule,
      {
        rosterPlayerIds: patchedOppTeam.entries.flatMap((entry) =>
          entry.slot !== "IL" && entry.playerId ? [entry.playerId] : [],
        ),
      },
    )
    const days = opponentDaysFromPlan(inner, daily, playersById, schedule)
    return { days, daily }
  }

  const threatScore = (daily: DailyLineups) => {
    const oppTotals = youTotalsFromDaily(
      daily,
      state.players,
      schedule,
      statWindow ?? "season",
    )
    const youTotals = Object.fromEntries(
      board.categories.map((row) => [row.categoryId, row.you]),
    ) as Record<CategoryId, number>
    return buildMatchupBoard(
      oppTotals,
      youTotals,
      categoryIdsFromBoard(board),
    ).projectedCatWins
  }

  // More spots must not model a weaker opponent (roster cuts without upside).
  let best = buildOne(oppSpotCount)
  let bestScore = threatScore(best.daily)
  if (oppSpotCount > 1) {
    for (let spots = 1; spots < oppSpotCount; spots += 1) {
      const candidate = buildOne(spots as 1 | 2 | 3)
      const score = threatScore(candidate.daily)
      if (score > bestScore + 1e-6) {
        best = candidate
        bestScore = score
      }
    }
  }

  const { days, daily } = best
  if (forceDate && forcedOpponentRosterDrops) {
    for (const day of days) {
      if (day.date !== forceDate) continue
      for (const cell of day.cells) {
        const forcedId = forcedOpponentRosterDrops[cell.spotIndex]
        if (!forcedId || cell.action === "empty" || cell.droppedPlayerId) {
          continue
        }
        cell.droppedPlayerId = forcedId
        if (cell.action === "add" && !day.droppedPlayerId) {
          day.droppedPlayerId = forcedId
        }
      }
    }
  }
  return { days, daily }
}

export const buildStreamingPlan = ({
  spotCount,
  state,
  schedule,
  board,
  addLimit: addLimitInput,
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
  puntCategoryIds: toggledPuntCategoryIds,
  statPairs,
  forcedAdds: forcedAddsInput,
  droppablePlayerIds,
}: BuildStreamingPlanInput): StreamingPlan => {
  const seasonRosterIds = new Set(
    (state.teams[state.perspectiveTeamIndex]?.entries ?? [])
      .map((entry) => entry.playerId)
      .filter((playerId): playerId is string => Boolean(playerId)),
  )
  const dropProtected = (playerId: string | null | undefined): boolean => {
    if (!playerId) return false
    if (droppablePlayerIds) {
      if (!seasonRosterIds.has(playerId)) return false
      return !droppablePlayerIds.has(playerId)
    }
    return isAdpProtected(adpByPlayerId?.[playerId])
  }
  const forcedAdds = forcedAddsInput ?? []
  const rejectedAddLocks: StreamingAddLock[] = []
  const lockForSpotOnDate = (spotIndex: number, date: string) =>
    forcedAdds.find(
      (lock) =>
        !rejectedAddLocks.includes(lock) &&
        lock.spotIndex === spotIndex &&
        date >= lock.date &&
        date <= lock.holdUntil,
    )
  const window = inputStatWindow ?? "season"
  const addLimit = addLimitInput ?? streamingAddLimitForSchedule(schedule)
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const freeAgents = filterStreamAddPool(
    state.availablePlayerIds
      .map((id) => playersById.get(id))
      .filter((player): player is SeasonPlayer => Boolean(player)),
  )
  const waiverPeriodDays = resolveWaiverPeriodDays({
    inputDays: waiverPeriodDaysInput,
    leagueDays: state.waiverPeriodDays,
  })
  const droppedOnByPlayerId = new Map<string, string>()
  const rosteredStreamerIds = new Set<string>()
  const markDropped = (playerId: string | null | undefined, date: string) => {
    if (!playerId) return
    droppedOnByPlayerId.set(playerId, date)
    rosteredStreamerIds.delete(playerId)
  }
  let isAlreadyOnPlan: (playerId: string, date: string) => boolean = () => false
  const canAddPlayer = (playerId: string, date: string) => {
    if (isAlreadyOnPlan(playerId, date)) return false
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
    freeAgents.filter(
      (player) =>
        canAddPlayer(player.id, date) &&
        isStreamAddEligibleOnDate(player, date, schedule),
    )
  const onlyAddable = (playerIds: string[], date: string) =>
    playerIds.filter((playerId) => canAddPlayer(playerId, date))

  const blocks = findStreamingBlocks(freeAgents, schedule)
  const addableBlocks = (date: string) =>
    blocks.filter((block) => canAddPlayer(block.playerId, date))
  const puntCategoryIds = mergeStreamingPuntIds(
    state.categories,
    toggledPuntCategoryIds,
  )
  let weakCats = weakCategories(board, puntCategoryIds)
  const leakCategoryIds = seasonLeakCategoryIds(state, puntCategoryIds)
  let chaseNote = streamingChaseNote(weakCats, statPairs)
  const occupants: (string | null)[] = Array.from({ length: spotCount }, () => null)
  const holdUntilBySpot: (string | null)[] = Array.from(
    { length: spotCount },
    () => null,
  )
  const addedOnBySpot: (string | null)[] = Array.from(
    { length: spotCount },
    () => null,
  )
  const holdUntilFor = (player: SeasonPlayer, fromDate: string) =>
    streamingHoldUntil(player, fromDate, spotCount, schedule)
  const lastReleasedBySpot: (string | null)[] = Array.from(
    { length: spotCount },
    () => null,
  )
  const addsBySpot = Array.from({ length: spotCount }, () => 0)
  const dayCount = schedule.matchup.days.length
  let addsUsed = 0
  const didProtectDrops = false
  const days: StreamingPlanDay[] = []
  const weekDroppedPlayers = new Set<string>()
  const releasedStreamerIds = new Set<string>()
  const youTeam = state.teams[state.perspectiveTeamIndex]
  const rosterSlots = rosterSlotsFor(state)
  const oppTeam =
    typeof opponentTeamIndex === "number"
      ? state.teams.find((team) => team.teamIndex === opponentTeamIndex)
      : state.teams.find((_, index) => index !== state.perspectiveTeamIndex)
  let opponentDays: OpponentStreamDay[] = emptyOpponentDays(
    schedule.matchup.days,
  )
  let oppWorkingDaily: DailyLineups = {}
  if (oppSpotCount && oppTeam) {
    const opponentSelf = buildOpponentSelfPlan({
      oppTeam,
      oppSpotCount,
      state,
      schedule,
      board,
      addLimit,
      adpByPlayerId,
      injuryOutDaysByPlayerId,
      forcedOpponentRosterDrops,
      waiverPeriodDays,
      winnerStreamRecipes,
      today,
      statWindow: inputStatWindow,
      statPairs,
      playersById,
      rosterSlots,
    })
    opponentDays = opponentSelf.days
    oppWorkingDaily = opponentSelf.daily
    if (!youIdle) {
      const baseOppDaily = initDailyLineups(
        schedule.matchup.days,
        oppTeam.entries,
        rosterSlots,
        state.players,
        schedule,
      )
      const chaseBoard = shiftMatchupBoardByOpponentDelta(
        board,
        youTotalsFromDaily(baseOppDaily, state.players, schedule, window),
        youTotalsFromDaily(
          opponentSelf.daily,
          state.players,
          schedule,
          window,
        ),
      )
      weakCats = weakCategories(chaseBoard, puntCategoryIds)
      chaseNote = streamingChaseNote(weakCats, statPairs)
    }
  }
  if (youIdle) {
    return {
      spotCount,
      addLimit,
      addsUsed: 0,
      gameStarts: 0,
      summaryReasons: buildSummaryReasons(false),
      days: emptyStreamingPlanDays(schedule.matchup.days, spotCount),
      opponentDays,
      opponentDaily: oppWorkingDaily,
      chaseNote,
      rejectedAddLocks,
    }
  }
  const sourceDaily: DailyLineups =
    daily ??
    initDailyLineups(
      schedule.matchup.days,
      youTeam?.entries ?? [],
      rosterSlots,
      state.players,
      schedule,
    )
  let workingDaily: DailyLineups = Object.fromEntries(
    Object.entries(sourceDaily).map(([day, entries]) => [
      day,
      entries.map((entry) => ({ ...entry })),
    ]),
  )
  const previewBaseDaily: DailyLineups = Object.fromEntries(
    Object.entries(workingDaily).map(([day, entries]) => [
      day,
      entries.map((entry) => ({ ...entry })),
    ]),
  )
  const initialHoleByDate = Object.fromEntries(
    schedule.matchup.days.map((day) => [
      day,
      buildHoleDayLineup({
        day,
        teamEntries: youTeam?.entries ?? [],
        players: state.players,
        schedule,
        savedDay: daily?.[day],
        rosterSlots,
      }),
    ]),
  )
  const spotBlockTimelines = assignSpotBlockTimelines(
    spotCount,
    addLimit,
    blocks,
    schedule.matchup.days,
    playersById,
    weakCats,
    initialHoleByDate,
    schedule,
    window,
  )
  isAlreadyOnPlan = (playerId, date) => {
    if (rosteredStreamerIds.has(playerId) && !releasedStreamerIds.has(playerId)) {
      return true
    }
    return schedule.matchup.days.some(
      (day) =>
        day >= date &&
        (workingDaily[day] ?? []).some((entry) => entry.playerId === playerId),
    )
  }
  let pickHoleDate = schedule.matchup.days[0] ?? ""
  let pickHoleByDate: Record<string, SeasonRosterEntry[]> = {}
  const ourPickOptions = (
    requirePositiveDelta?: boolean,
    extras?: {
      requirePositiveContestedDelta?: boolean
      chaseCategoryIds?: CategoryId[]
      statPairs?: readonly StatPairRow[]
      leakCategoryIds?: ReadonlySet<CategoryId>
    },
  ) => {
    const options: {
      requirePositiveDelta?: boolean
      requirePositiveContestedDelta?: boolean
      recipes: WinnerStreamRecipe[]
      oppDaily?: DailyLineups
      statWindow?: StatWindow
      chaseCategoryIds?: CategoryId[]
      densityRankFor?: (playerId: string) => number
      startsFor?: (playerId: string) => number
      statPairs?: readonly StatPairRow[]
      leakCategoryIds?: ReadonlySet<CategoryId>
    } = {
      recipes: winnerStreamRecipes,
      statWindow: window,
      chaseCategoryIds: extras?.chaseCategoryIds ?? weakCats,
      statPairs,
      leakCategoryIds,
    }
    if (spotCount === 1) {
      options.startsFor = () => 1
      options.densityRankFor = () => 0
    } else {
      options.densityRankFor = (playerId: string) => {
        const player = playersById.get(playerId)
        if (!player) return -1
        return holeDensityRank(player, pickHoleDate, schedule, pickHoleByDate)
      }
      options.startsFor = (playerId: string) => {
        const player = playersById.get(playerId)
        if (!player) return 0
        const startDays =
          spotCount === 3
            ? schedule.matchup.days
                .filter((day) => day >= pickHoleDate)
                .slice(0, 4)
            : schedule.matchup.days
        return remainingHoleStarts(
          player,
          pickHoleDate,
          startDays,
          pickHoleByDate,
          schedule,
        )
      }
    }
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
    return targetCategoryIdsFromBoards(before, after, weakCats)
  }
  const clearPlannedOccupant = (playerId: string, fromDate: string) => {
    releasedStreamerIds.add(playerId)
    rosteredStreamerIds.delete(playerId)
    for (const day of schedule.matchup.days) {
      if (day < fromDate) continue
      workingDaily[day] = (workingDaily[day] ?? []).map((entry) =>
        entry.playerId === playerId ? { ...entry, playerId: null } : entry,
      )
    }
  }

  const spotsNeedingRefill = new Set<number>()
  for (const [dayIndex, date] of schedule.matchup.days.entries()) {
    const cells: (StreamingPlanDayCell | null)[] = Array.from(
      { length: spotCount },
      () => null,
    )
    const seatedToday = new Set<string>()
    const previousOccupants = [...occupants]
    const remainingDays = dayCount - dayIndex
    let todayAddCap = dailyAddPaceLimit(addLimit - addsUsed, remainingDays)
    let addsToday = 0
    const assignmentStartingToday = (spotIndex: number) =>
      spotBlockTimelines[spotIndex]!.find((block) => block.startDate === date)
    const canAffordAdd = (spotIndex: number, increasesStarts = true) => {
      if (addsToday >= todayAddCap) return false
      return canSpotSpendAdd(
        addsUsed,
        addLimit,
        addsBySpot[spotIndex]!,
        addCapForSpot(addLimit, spotCount, spotIndex),
        increasesStarts,
      )
    }
    const holdExpiredBySpot = Array.from({ length: spotCount }, () => false)
    let afterDrop: (string | null)[] = occupants.map(() => null)
    const canSpotAdd = (spotIndex: number, increasesStarts = true) => {
      if (!canAffordAdd(spotIndex, increasesStarts)) return false
      if (spotCount === 1) return true
      if (forceFillForSpot(spotIndex)) return true
      if (remainingDays === 1) return true
      if (assignmentStartingToday(spotIndex)) return true
      if (holdExpiredBySpot[spotIndex]) return true
      return afterDrop[spotIndex] == null
    }
    const forceFillForSpot = (spotIndex: number): boolean => {
      if (today && date < today) return false
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
    pickHoleDate = date
    pickHoleByDate = holeByDate
    const holeLineup = holeByDate[date] ?? []
    const holeCount = countOpenActiveSlots(holeLineup)
    const remainingHoleDays = schedule.matchup.days
      .slice(dayIndex)
      .filter((day) => countOpenActiveSlots(holeByDate[day] ?? []) > 0)
      .length
    const streamerCap = Math.min(spotCount, holeCount)
    const rankAllYouCandidates = (
      candidateIds: string[],
      targetWeakCats = weakCats,
    ): SeasonPlayer[] => {
      const players = candidateIds
        .map((id) => playersById.get(id))
        .filter((player): player is SeasonPlayer => Boolean(player))
      if (spotCount === 1) {
        return players
          .filter(
            (player) =>
              !seatedToday.has(player.id) && playsOn(player, date, schedule),
          )
          .sort((left, right) => {
            const scoreDelta =
              weakCatScore(right, targetWeakCats, window) -
              weakCatScore(left, targetWeakCats, window)
            if (scoreDelta !== 0) return scoreDelta
            return compareAddTiebreak(
              {
                expectedWins: expectedWinsAdded(
                  left,
                  remainingGameDays(left, date, schedule),
                  board,
                  window,
                ),
                adp: adpByPlayerId?.[left.id],
              },
              {
                expectedWins: expectedWinsAdded(
                  right,
                  remainingGameDays(right, date, schedule),
                  board,
                  window,
                ),
                adp: adpByPlayerId?.[right.id],
              },
            )
          })
      }
      return rankHoleEligibleFas(
        players,
        date,
        schedule,
        targetWeakCats,
        seatedToday,
        holeByDate,
        window,
        adpByPlayerId,
        board,
      )
    }

    const rankYouCandidates = (
      candidateIds: string[],
      targetWeakCats = weakCats,
    ) => rankAllYouCandidates(candidateIds, targetWeakCats).map((player) => player.id)

    const forcedToday = new Set<number>()
    let forcedAddsApplied = 0
    for (const lock of forcedAdds) {
      if (lock.date !== date || lock.spotIndex >= spotCount) continue
      if (
        forcedRosterDrops?.[streamingAddDropKey(date, lock.spotIndex)] ===
        "hold"
      ) {
        rejectedAddLocks.push(lock)
        continue
      }
      const added = playersById.get(lock.playerId)
      if (!added || !playsOn(added, date, schedule)) {
        rejectedAddLocks.push(lock)
        continue
      }
      const plannedId = occupants[lock.spotIndex]
      const clearingPlanned = Boolean(plannedId && plannedId !== lock.playerId)
      const lineupBeforeClear = clearingPlanned ? { ...workingDaily } : null
      const plannedWasRostered = Boolean(
        plannedId && rosteredStreamerIds.has(plannedId),
      )
      const plannedWasReleased = Boolean(
        plannedId && releasedStreamerIds.has(plannedId),
      )
      if (clearingPlanned && plannedId) {
        clearPlannedOccupant(plannedId, date)
      }
      const undoPlannedClear = () => {
        if (!clearingPlanned || !plannedId || !lineupBeforeClear) return
        workingDaily = lineupBeforeClear
        if (plannedWasRostered) rosteredStreamerIds.add(plannedId)
        else rosteredStreamerIds.delete(plannedId)
        if (plannedWasReleased) releasedStreamerIds.add(plannedId)
        else releasedStreamerIds.delete(plannedId)
      }
      const cutAllowed = (
        playerId: string | null | undefined,
      ): playerId is string =>
        Boolean(
          playerId &&
            playerId !== lock.playerId &&
            !weekDroppedPlayers.has(playerId) &&
            !dropProtected(playerId),
        )
      const rosterOpen = hasOpenNonIlSlot(youTeam?.entries ?? [])
      const dailyFullAfterEarlierLock =
        forcedAddsApplied > 0 &&
        isDailyLineupFullForDate(workingDaily, date, playersById, schedule)
      const forcedDrop =
        forcedRosterDrops?.[streamingAddDropKey(date, lock.spotIndex)]
      let drop: StreamerMoveDrop = { kind: "none", playerId: null }
      let rosterDropKind: StreamingPlanRosterDropKind = "none"
      if (forcedDrop === "open_slot") {
        if (!rosterOpen) {
          undoPlannedClear()
          rejectedAddLocks.push(lock)
          continue
        }
        drop = { kind: "none", playerId: null }
        rosterDropKind = "open_slot"
      } else if (typeof forcedDrop === "string" && forcedDrop !== "hold") {
        if (
          !isValidForcedPlayerDrop(
            forcedDrop,
            youTeam?.entries ?? [],
            playersById,
            weekDroppedPlayers,
            rosteredStreamerIds,
          ) ||
          forcedDrop === lock.playerId
        ) {
          undoPlannedClear()
          rejectedAddLocks.push(lock)
          continue
        }
        drop = { kind: "player", playerId: forcedDrop }
        rosterDropKind = "player"
      } else if (!rosterOpen || dailyFullAfterEarlierLock) {
        const autoCut = pickAutoRosterCut({
          date,
          days: schedule.matchup.days,
          teamEntries: youTeam?.entries ?? [],
          players: state.players,
          schedule,
          seatedTonight: holeLineup,
          adpByPlayerId,
          board,
          statWindow: window,
          droppablePlayerIds,
        })
        const dropId = cutAllowed(autoCut)
          ? autoCut
          : rankRosterDropPlayerIds(
              youTeam?.entries ?? [],
              playersById,
              date,
              schedule,
              weakCats,
              new Set([lock.playerId]),
              adpByPlayerId,
              injuryOutDaysByPlayerId,
              board,
              false,
              false,
              window,
              true,
              droppablePlayerIds,
            ).find((id) => cutAllowed(id))
        if (!dropId) {
          undoPlannedClear()
          rejectedAddLocks.push(lock)
          continue
        }
        drop = { kind: "player", playerId: dropId }
        rosterDropKind = "player"
      }
      const moved = pickBestStreamerMove(
        [lock.playerId],
        workingDaily,
        date,
        drop,
        state.players,
        schedule,
        board,
        isCompatibleAlternative,
        ourPickOptions(false),
      )
      if (!moved) {
        undoPlannedClear()
        rejectedAddLocks.push(lock)
        continue
      }
      workingDaily = moved.nextDaily
      occupants[lock.spotIndex] = lock.playerId
      addedOnBySpot[lock.spotIndex] = date
      holdUntilBySpot[lock.spotIndex] = lock.holdUntil
      rosteredStreamerIds.add(lock.playerId)
      addsUsed += 1
      addsToday += 1
      forcedAddsApplied += 1
      addsBySpot[lock.spotIndex]! += 1
      if (drop.kind === "player" && drop.playerId) {
        weekDroppedPlayers.add(drop.playerId)
        markDropped(drop.playerId, date)
      }
      const dropId = drop.kind === "player" ? drop.playerId : null
      const dropIsSeasonRoster = Boolean(
        dropId &&
          (youTeam?.entries ?? []).some(
            (entry) => entry.playerId === dropId,
          ),
      )
      cells[lock.spotIndex] = {
        spotIndex: lock.spotIndex,
        playerId: lock.playerId,
        action: dropId && !dropIsSeasonRoster ? "drop_add" : "add",
        droppedPlayerId: dropId && !dropIsSeasonRoster ? dropId : null,
        rosterDropPlayerId: dropIsSeasonRoster ? dropId : null,
        rosterDropKind: dropIsSeasonRoster
          ? "player"
          : rosterDropKind === "open_slot"
            ? "open_slot"
            : "none",
        addIndex: addsUsed,
        alternativePlayerIds: [],
        targetCategoryIds: [],
      }
      forcedToday.add(lock.spotIndex)
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
    } else if (
      holeCount === 0 &&
      !Array.from({ length: spotCount }, (_, spotIndex) =>
        forceFillForSpot(spotIndex),
      ).some(Boolean) &&
      !(
        spotCount >= 2 &&
        addableFreeAgents(date).some((candidate) =>
          playsOn(candidate, date, schedule),
        )
      )
    ) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
        if (forcedToday.has(spotIndex)) continue
        const lock = lockForSpotOnDate(spotIndex, date)
        if (lock && date > lock.date && date <= lock.holdUntil) {
          occupants[spotIndex] = lock.playerId
          cells[spotIndex] = {
            spotIndex,
            playerId: lock.playerId,
            action: "hold",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "none",
            addIndex: null,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          }
          continue
        }
        const previousId = occupants[spotIndex]
        if (
          previousId &&
          dropProtected(previousId)
        ) {
          occupants[spotIndex] = previousId
          cells[spotIndex] = {
            spotIndex,
            playerId: previousId,
            action: "hold",
            droppedPlayerId: null,
            rosterDropPlayerId: null,
            rosterDropKind: "none",
            addIndex: null,
            alternativePlayerIds: [],
            targetCategoryIds: [],
          }
          continue
        }
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
    // Pass 1: keep a 2-in-3 / 3-in-4 add through its off night, then drop
    // when the window is over so the next dense block can start.
    afterDrop = occupants.map((playerId, spotIndex) => {
      const lock = lockForSpotOnDate(spotIndex, date)
      if (lock && playerId === lock.playerId) return playerId
      // 1-spot still frees the off night so another streamer can play, without
      // dropping the protected player. 2- and 3-spot keep him in the spot.
      if (
        spotCount === 1 &&
        playerId &&
        dropProtected(playerId)
      ) {
        const protectedPlayer = playersById.get(playerId)
        if (
          protectedPlayer &&
          !playsOn(protectedPlayer, date, schedule)
        ) {
          holdUntilBySpot[spotIndex] = null
          holdExpiredBySpot[spotIndex] = true
          return null
        }
      }
      if (spotCount === 1) {
        if (playerId && dropProtected(playerId)) {
          return playerId
        }
        if (playerId) {
          clearPlannedOccupant(playerId, date)
          lastReleasedBySpot[spotIndex] = playerId
        }
        holdUntilBySpot[spotIndex] = null
        holdExpiredBySpot[spotIndex] = true
        return null
      }
      const holdUntil = holdUntilBySpot[spotIndex]
      const occupant = playerId ? playersById.get(playerId) : undefined
      const blockStillOpen =
        Boolean(occupant) &&
        (playsOn(occupant!, date, schedule) ||
          (remainingHoleStarts(
            occupant!,
            date,
            schedule.matchup.days,
            holeByDate,
            schedule,
          ) > 0 &&
            isInsideHeldStreamingWindow(occupant!, date, schedule, holeByDate)))
      if (playerId && holdUntil && date <= holdUntil && blockStillOpen) {
        return playerId
      }
      if (holdUntil && date > holdUntil) {
        if (playerId && dropProtected(playerId)) {
          return playerId
        }
        if (playerId) {
          clearPlannedOccupant(playerId, date)
          lastReleasedBySpot[spotIndex] = playerId
        }
        holdUntilBySpot[spotIndex] = null
        holdExpiredBySpot[spotIndex] = true
        return null
      }
      const occupantHoleStarts = occupant
        ? remainingHoleStarts(
            occupant,
            date,
            schedule.matchup.days,
            holeByDate,
            schedule,
          )
        : 0
      const keepOffNightHold =
        Boolean(occupant) &&
        occupantHoleStarts > 0 &&
        !playsOn(occupant!, date, schedule) &&
        isInsideHeldStreamingWindow(occupant!, date, schedule, holeByDate)
      if (
        spotIndex >= streamerCap &&
        !keepOffNightHold &&
        countOpenActiveSlots(holeLineup) <= 0
      ) {
        if (playerId && dropProtected(playerId)) {
          return playerId
        }
        if (playerId) clearPlannedOccupant(playerId, date)
        holdUntilBySpot[spotIndex] = null
        return null
      }
      if (!playerId) return null
      const player = playersById.get(playerId)
      if (
        !player ||
        remainingGameDays(player, date, schedule) <= 0 ||
        remainingHoleStarts(
          player,
          date,
          schedule.matchup.days,
          holeByDate,
          schedule,
        ) <= 0
      ) {
        if (dropProtected(playerId)) return playerId
        clearPlannedOccupant(playerId, date)
        holdUntilBySpot[spotIndex] = null
        return null
      }
      const playsToday = playsOn(player, date, schedule)
      if (
        !playsToday &&
        isInsideHeldStreamingWindow(player, date, schedule, holeByDate)
      ) {
        return playerId
      }
      if (
        !playsToday ||
        !playerHasEligibleHole(player, holeLineup)
      ) {
        if (dropProtected(playerId)) return playerId
        clearPlannedOccupant(playerId, date)
        holdUntilBySpot[spotIndex] = null
        return null
      }
      return playerId
    })
    if (spotCount >= 2) {
      const someonePlaysToday = afterDrop.some((playerId) => {
        const player = playerId ? playersById.get(playerId) : undefined
        return Boolean(player && playsOn(player, date, schedule))
      })
      const hasEmptySpot = afterDrop.some((playerId) => !playerId)
      if (!someonePlaysToday && !hasEmptySpot) {
        const offNight = afterDrop.findIndex((playerId, index) => {
          if (!playerId || dropProtected(playerId)) return false
          const until = holdUntilBySpot[index]
          return !until || date > until
        })
        if (offNight >= 0) {
          const released = afterDrop[offNight]
          if (released) {
            clearPlannedOccupant(released, date)
            lastReleasedBySpot[offNight] = released
          }
          holdUntilBySpot[offNight] = null
          holdExpiredBySpot[offNight] = true
          afterDrop[offNight] = null
        }
      }
    }
    todayAddCap = dailyAddPaceLimit(
      addLimit - addsUsed,
      remainingHoleDays > 0 ? remainingHoleDays : remainingDays,
      afterDrop.filter((id) => !id).length,
    )

    const needFill: number[] = []
    const keptOnRoster = new Set<string>()
    const pendingRosterDropBySpot = new Map<number, string>()
    const holdBreakSpots = new Set<number>()
    const stagedHoldBreaks = new Map<
      number,
      {
        heldId: string
        holdUntil: string | null
        addedOn: string | null
        cleared: { day: string; index: number }[]
      }
    >()
    const replacementWouldLap = (spotIndex: number): boolean => {
      const mine = addsBySpot[spotIndex] ?? 0
      for (let other = 0; other < spotCount; other += 1) {
        const theirs = addsBySpot[other] ?? 0
        if (other !== spotIndex && theirs > 0 && theirs < mine) return true
      }
      return false
    }
    const openMultiDayHold = (spotIndex: number, heldId: string): boolean => {
      const lock = lockForSpotOnDate(spotIndex, date)
      if (lock && date <= lock.holdUntil) return false
      if (spotCount < 2) return false
      if (dropProtected(heldId)) return false
      const until = holdUntilBySpot[spotIndex]
      if (!until || until <= date) return false
      if (addsUsed >= addLimit) return false
      if (replacementWouldLap(spotIndex)) return false
      const addDate = addedOnBySpot[spotIndex]
      if (!addDate || addDate >= date) return false
      const heldForBlock = playersById.get(heldId)
      const twoInThreeGames = heldForBlock
        ? gamesInMatchupDays(heldForBlock, addDate, schedule, 3)
        : []
      const lastTwoInThree = twoInThreeGames[twoInThreeGames.length - 1]
      if (
        twoInThreeGames.length === 2 &&
        lastTwoInThree &&
        date <= lastTwoInThree
      ) {
        return false
      }
      const span = schedule.matchup.days.filter((day) => day >= addDate).length
      if (span < 4) return false
      const wireToday = addableFreeAgents(date).some(
        (candidate) =>
          candidate.id !== heldId && playsOn(candidate, date, schedule),
      )
      if (!wireToday) return false
      const dropEntries = entriesWithDroppedOpen(
        youTeam?.entries ?? [],
        weekDroppedPlayers,
      ).map((entry) =>
        entry.playerId === heldId ? { ...entry, playerId: null } : entry,
      )
      const quietDropId = pickAutoRosterCut({
        date,
        days: schedule.matchup.days,
        teamEntries: dropEntries,
        players: state.players,
        schedule,
        seatedTonight: holeLineup,
        adpByPlayerId,
        board,
        statWindow: window,
        droppablePlayerIds,
      })
      const dropId =
        quietDropId ??
        rankRosterDropPlayerIds(
          dropEntries,
          playersById,
          date,
          schedule,
          weakCats,
          new Set([...weekDroppedPlayers, heldId]),
          adpByPlayerId,
          injuryOutDaysByPlayerId,
          board,
          false,
          false,
          window,
          true,
          droppablePlayerIds,
        ).find(
          (candidateId) =>
            candidateId !== heldId &&
            !dropProtected(candidateId),
        ) ??
        null
      if (!dropId || dropId === heldId) return false
      if (dropProtected(dropId)) return false
      const heldPlaysToday = Boolean(
        playersById.get(heldId) &&
          playsOn(playersById.get(heldId)!, date, schedule),
      )
      const cleared: { day: string; index: number }[] = []
      for (const day of schedule.matchup.days) {
        if (heldPlaysToday ? day <= date : day < date) continue
        workingDaily[day] = (workingDaily[day] ?? []).map((entry, index) => {
          if (entry.playerId !== heldId) return entry
          cleared.push({ day, index })
          return { ...entry, playerId: null }
        })
      }
      stagedHoldBreaks.set(spotIndex, {
        heldId,
        holdUntil: holdUntilBySpot[spotIndex] ?? null,
        addedOn: addedOnBySpot[spotIndex] ?? null,
        cleared,
      })
      keptOnRoster.add(heldId)
      pendingRosterDropBySpot.set(spotIndex, dropId)
      spotsNeedingRefill.add(spotIndex)
      holdBreakSpots.add(spotIndex)
      holdUntilBySpot[spotIndex] = null
      holdExpiredBySpot[spotIndex] = true
      occupants[spotIndex] = null
      afterDrop[spotIndex] = null
      needFill.push(spotIndex)
      return true
    }
    const releaseLongWeekEndHold = (
      spotIndex: number,
      heldId: string,
    ): boolean => {
      const lock = lockForSpotOnDate(spotIndex, date)
      if (lock && date <= lock.holdUntil) return false
      if (spotCount < 2) return false
      if (!dropProtected(heldId)) return false
      if (addsUsed >= addLimit) return false
      if (replacementWouldLap(spotIndex)) return false
      const addDate = addedOnBySpot[spotIndex]
      if (!addDate || addDate >= date) return false
      const heldForBlock = playersById.get(heldId)
      const twoInThreeGames = heldForBlock
        ? gamesInMatchupDays(heldForBlock, addDate, schedule, 3)
        : []
      const lastTwoInThree = twoInThreeGames[twoInThreeGames.length - 1]
      if (
        twoInThreeGames.length === 2 &&
        lastTwoInThree &&
        date <= lastTwoInThree
      ) {
        return false
      }
      const span = schedule.matchup.days.filter((day) => day >= addDate).length
      if (span < 4) return false
      const wireToday = addableFreeAgents(date).some(
        (candidate) =>
          candidate.id !== heldId && playsOn(candidate, date, schedule),
      )
      if (!wireToday) return false
      holdBreakSpots.add(spotIndex)
      afterDrop[spotIndex] = null
      holdExpiredBySpot[spotIndex] = true
      needFill.push(spotIndex)
      return true
    }
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
      if (forcedToday.has(spotIndex)) continue
      const activeLock = lockForSpotOnDate(spotIndex, date)
      if (
        activeLock &&
        date > activeLock.date &&
        date <= activeLock.holdUntil
      ) {
        occupants[spotIndex] = activeLock.playerId
        cells[spotIndex] = {
          spotIndex,
          playerId: activeLock.playerId,
          action: "hold",
          droppedPlayerId: null,
          rosterDropPlayerId: null,
          rosterDropKind: "none",
          addIndex: null,
          alternativePlayerIds: [],
          targetCategoryIds: [],
        }
        continue
      }
      const heldId = afterDrop[spotIndex]
      const held = heldId ? playersById.get(heldId) : undefined
      const heldPlaysToday = Boolean(
        held && playsOn(held, date, schedule),
      )
      if (
        heldId &&
        !forceFillForSpot(spotIndex) &&
        dropProtected(heldId)
      ) {
        if (releaseLongWeekEndHold(spotIndex, heldId)) continue
        if (held && heldPlaysToday) {
          seatStreamerIfOpen(
            holeLineup,
            heldId,
            date,
            playersById,
            schedule,
          )
        }
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
        continue
      }
      if (
        heldId &&
        holdUntilBySpot[spotIndex] &&
        date <= holdUntilBySpot[spotIndex] &&
        !forceFillForSpot(spotIndex)
      ) {
        if (openMultiDayHold(spotIndex, heldId)) continue
        if (releaseLongWeekEndHold(spotIndex, heldId)) continue
        if (held && heldPlaysToday) {
          seatStreamerIfOpen(
            holeLineup,
            heldId,
            date,
            playersById,
            schedule,
          )
        }
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
        continue
      }
      if (
        heldId &&
        held &&
        !heldPlaysToday &&
        !forceFillForSpot(spotIndex) &&
        isInsideHeldStreamingWindow(held, date, schedule, holeByDate)
      ) {
        if (releaseLongWeekEndHold(spotIndex, heldId)) continue
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
        continue
      }
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
        if (releaseLongWeekEndHold(spotIndex, heldId)) continue
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
        const heldToday = cells.some(
          (cell) => cell?.action === "hold" && cell.playerId,
        )
        if (
          countOpenActiveSlots(holeLineup) <= 0 &&
          !(spotCount >= 2 && heldToday) &&
          !forceFillForSpot(spotIndex)
        ) {
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

    // Prefer spots that have used fewer adds so churn stays even across spots.
    needFill.sort((left, right) => {
      if (spotsNeedingRefill.has(left) !== spotsNeedingRefill.has(right)) {
        return spotsNeedingRefill.has(left) ? -1 : 1
      }
      if (holdExpiredBySpot[left] !== holdExpiredBySpot[right]) {
        return holdExpiredBySpot[left] ? -1 : 1
      }
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
          rosteredStreamerIds,
        )
      ) {
        reservedForcedDrops.add(forced)
        forcedPlayerBySpot.set(spotIndex, forced)
      }
    }

    for (const spotIndex of needFill) {
      const previousId = previousOccupants[spotIndex] ?? null
      const streamerStays = Boolean(previousId && keptOnRoster.has(previousId))
      const pendingDropId = pendingRosterDropBySpot.get(spotIndex) ?? null
      let playerId: string | null = null
      let action: StreamingPlanAction = "empty"
      let droppedPlayerId: string | null = null
      let addIndex: number | null = null
      let alternativePlayerIds: string[] = []
      let rosterDropKind: StreamingPlanRosterDropKind = pendingDropId
        ? "player"
        : "none"
      let rosterDropPlayerId: string | null = pendingDropId
      let targetCategoryIds: CategoryId[] = []
      const forceFill = forceFillForSpot(spotIndex)
      const forced = forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)]

      if (forced === "hold") {
        action = "hold"
        playerId = previousId
      } else if (canSpotAdd(spotIndex)) {
        const rankedBlocks = listTodayBlocks(
          addableBlocks(date),
          date,
          seatedToday,
          playersById,
          weakCats,
          dayIndex,
          dayCount,
          false,
          window,
          adpByPlayerId,
          board,
        )
        const todayFaIds = addableFreeAgents(date).map((player) => player.id)
        const leftoverFaIds =
          (spotCount === 1 && previousId) || forceFill
            ? todayFaIds
            : todayFaIds.filter((id) => {
                const candidate = playersById.get(id)
                if (!candidate) return false
                if (
                  remainingHoleStarts(
                    candidate,
                    date,
                    schedule.matchup.days,
                    holeByDate,
                    schedule,
                  ) <= 0
                ) {
                  return false
                }
                const tier = holeWindowTier(
                  candidate,
                  date,
                  schedule.matchup.days,
                  holeByDate,
                  schedule,
                )
                if (!tier) return false
                const noDenserFa = !todayFaIds.some((otherId) => {
                  const other = playersById.get(otherId)
                  if (!other) return false
                  const otherTier = holeWindowTier(
                    other,
                    date,
                    schedule.matchup.days,
                    holeByDate,
                    schedule,
                  )
                  return Boolean(
                    otherTier &&
                      densityTierRank(otherTier) > densityTierRank(tier),
                  )
                })
                if (tier === "thin") {
                  return allowsThinFill(
                    dayIndex,
                    schedule.matchup.days.length,
                    {
                      fillsEmptySlot: countOpenActiveSlots(holeLineup) > 0,
                      noDenserFa,
                    },
                  )
                }
                return true
              })
        const candidatePoolIds = [
          ...new Set([
            ...rankedBlocks.map((block) => block.playerId),
            ...leftoverFaIds,
          ]),
        ]
        const allRankedCandidateIds = onlyAddable(
          rankAllYouCandidates(candidatePoolIds).map((player) => player.id),
          date,
        )
        const candidateIds = rankYouCandidates(candidatePoolIds)
        const reservedIds = new Set(seatedToday)
        if (!holdExpiredBySpot[spotIndex]) {
          for (let other = 0; other < spotCount; other += 1) {
            if (other === spotIndex || occupants[other]) continue
            const reserved = assignmentStartingToday(other)?.playerId
            if (reserved) reservedIds.add(reserved)
          }
        }
        const plannedAddId = assignmentStartingToday(spotIndex)?.playerId
        const expiredPrev =
          lastReleasedBySpot[spotIndex] ??
          (holdExpiredBySpot[spotIndex] ? previousId : null)
        const rankedIds = onlyAddable(
          plannedAddId && !reservedIds.has(plannedAddId)
            ? [
                plannedAddId,
                ...candidateIds.filter(
                  (id) => id !== plannedAddId && !reservedIds.has(id),
                ),
              ]
            : candidateIds.filter((id) => !reservedIds.has(id)),
          date,
        )
        const withoutExpired = expiredPrev
          ? rankedIds.filter((id) => id !== expiredPrev)
          : rankedIds
        const addableIds =
          withoutExpired.length > 0 ? withoutExpired : rankedIds
        const twoInThreeIds = addableIds.filter((id) => {
          const candidate = playersById.get(id)
          if (!candidate) return false
          return gamesInMatchupDays(candidate, date, schedule, 3).length >= 2
        })
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

        const protectedPrevious =
          Boolean(previousId) &&
          !forceFill &&
          dropProtected(previousId)
        const nextMatchupDate = schedule.matchup.days[dayIndex + 1]
        const multiGameStartsNextDay = (exceptId: string) => {
          if (!nextMatchupDate) return false
          return addableFreeAgents(nextMatchupDate).some((candidate) => {
            if (candidate.id === exceptId) return false
            if (!playsOn(candidate, nextMatchupDate, schedule)) return false
            return remainingGameDays(candidate, nextMatchupDate, schedule) >= 2
          })
        }

        if (previousId && !forceFill && !protectedPrevious && !streamerStays) {
          picked = tryMove({ kind: "player", playerId: previousId }, false)
        } else if (protectedPrevious && previousId) {
          if (hasOpenNonIlSlot(youTeam?.entries ?? [])) {
            rosterDrop = { kind: "open_slot", playerId: null, didProtect: true }
            picked = tryMove({ kind: "none", playerId: null }, false)
          }
          if (!picked) {
            const unavailableDropIds = new Set([
              ...weekDroppedPlayers,
              ...reservedForcedDrops,
              previousId,
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
              adpByPlayerId,
              board,
              statWindow: window,
              droppablePlayerIds,
            })
            if (dropId) {
              const cutPlayer = playersById.get(dropId)
              const cutRemain = cutPlayer
                ? remainingGameDays(cutPlayer, date, schedule)
                : 0
              const remainingGameCutsToday = cells.filter((cell) => {
                if (cell?.rosterDropKind !== "player" || !cell.rosterDropPlayerId) {
                  return false
                }
                const prior = playersById.get(cell.rosterDropPlayerId)
                return Boolean(
                  prior && remainingGameDays(prior, date, schedule) > 0,
                )
              }).length
              if (!(cutRemain > 0 && remainingGameCutsToday >= 2)) {
                const result = tryMove({ kind: "player", playerId: dropId }, true)
                if (result) {
                  picked = result
                  rosterDrop = {
                    kind: "player",
                    playerId: dropId,
                    didProtect: true,
                  }
                }
              }
            }
          }
          if (!picked) {
            action = "hold"
            playerId = previousId
            if (previousId) {
              seatStreamerIfOpen(
                holeLineup,
                previousId,
                date,
                playersById,
                schedule,
              )
              seatedToday.add(previousId)
            }
          }
        } else if (
          forced === "open_slot" &&
          hasOpenNonIlSlot(youTeam?.entries ?? [])
        ) {
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
        } else if (pendingDropId) {
          rosterDrop = { kind: "player", playerId: pendingDropId, didProtect: false }
          picked = tryMove({ kind: "player", playerId: pendingDropId }, true)
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
            adpByPlayerId,
            board,
            statWindow: window,
            droppablePlayerIds,
          })
          if (dropId) {
            const cutPlayer = playersById.get(dropId)
            const cutRemain = cutPlayer
              ? remainingGameDays(cutPlayer, date, schedule)
              : 0
            const remainingGameCutsToday = cells.filter((cell) => {
              if (cell?.rosterDropKind !== "player" || !cell.rosterDropPlayerId) {
                return false
              }
              const prior = playersById.get(cell.rosterDropPlayerId)
              return Boolean(
                prior && remainingGameDays(prior, date, schedule) > 0,
              )
            }).length
            if (!(cutRemain > 0 && remainingGameCutsToday >= 2)) {
              const result = tryMove({ kind: "player", playerId: dropId }, true)
              if (result) {
                const added = playersById.get(result.playerId)
                const oneDay =
                  !added || remainingGameDays(added, date, schedule) <= 1
                if (
                  !(
                    oneDay &&
                    twoInThreeIds.length === 0 &&
                    multiGameStartsNextDay(result.playerId)
                  )
                ) {
                  picked = result
                  rosterDrop = {
                    kind: "player",
                    playerId: dropId,
                    didProtect: false,
                  }
                }
              }
            }
          }
        }

        if (!picked && spotCount >= 2 && !previousId) {
          const heldTodayIds = new Set(
            cells.flatMap((cell) =>
              cell?.action === "hold" && cell.playerId ? [cell.playerId] : [],
            ),
          )
          if (heldTodayIds.size > 0) {
            const unavailableDropIds = new Set([
              ...weekDroppedPlayers,
              ...reservedForcedDrops,
              ...heldTodayIds,
            ])
            for (const dropId of rankRosterDropPlayerIds(
              (youTeam?.entries ?? []).map((entry) =>
                entry.playerId && unavailableDropIds.has(entry.playerId)
                  ? { ...entry, playerId: null }
                  : entry,
              ),
              playersById,
              date,
              schedule,
              weakCats,
              unavailableDropIds,
              adpByPlayerId,
              undefined,
              board,
              false,
              false,
              window,
              true,
              droppablePlayerIds,
            )) {
              if (dropProtected(dropId)) continue
              const result = tryMove({ kind: "player", playerId: dropId }, true)
              if (!result) continue
              const added = playersById.get(result.playerId)
              const oneDay =
                !added || remainingGameDays(added, date, schedule) <= 1
              if (
                oneDay &&
                twoInThreeIds.length === 0 &&
                multiGameStartsNextDay(result.playerId)
              ) {
                continue
              }
              picked = result
              rosterDrop = {
                kind: "player",
                playerId: dropId,
                didProtect: false,
              }
              break
            }
          }
        }

        if (
          picked &&
          spotCount >= 2 &&
          twoInThreeIds.length > 0
        ) {
          const pickedPlayer = playersById.get(picked.playerId)
          const pickedGames = pickedPlayer
            ? remainingGameDays(pickedPlayer, date, schedule)
            : 0
          if (pickedGames <= 1) {
            const denseDrop: StreamerMoveDrop =
              rosterDrop?.kind === "player" && rosterDrop.playerId
                ? { kind: "player", playerId: rosterDrop.playerId }
                : pendingDropId
                  ? { kind: "player", playerId: pendingDropId }
                  : previousId && !streamerStays && !protectedPrevious
                    ? { kind: "player", playerId: previousId }
                    : { kind: "none", playerId: null }
            const denseFull =
              denseDrop.kind === "none" &&
              isDailyLineupFullForDate(
                workingDaily,
                date,
                playersById,
                schedule,
              )
            if (!denseFull) {
              const densePick = pickBestStreamerMove(
                twoInThreeIds,
                workingDaily,
                date,
                denseDrop,
                state.players,
                schedule,
                board,
                isCompatibleAlternative,
                ourPickOptions(denseDrop.kind === "player" ? true : false),
              )
              if (densePick) picked = densePick
            }
          }
        }

        if (picked) {
          targetCategoryIds = targetCatsFromMove(workingDaily, picked.nextDaily)
          if (targetCategoryIds.length === 0) {
            targetCategoryIds = weakCats.slice(0, 2)
          }
          workingDaily = picked.nextDaily
          playerId = picked.playerId
          alternativePlayerIds = allRankedCandidateIds
            .filter((candidateId) => candidateId !== picked.playerId)
            .filter((candidateId) =>
              isCompatibleAlternative(picked.playerId, candidateId),
            )
            .slice(0, 3)
          if (previousId && !forceFill && !protectedPrevious && !streamerStays) {
            action = "drop_add"
            droppedPlayerId = previousId
          } else {
            action = "add"
            if (pendingDropId) {
              rosterDropKind = "player"
              rosterDropPlayerId = pendingDropId
            } else if (rosterDrop) {
              rosterDropKind = rosterDrop.kind
              rosterDropPlayerId = rosterDrop.playerId
            }
          }
          spotsNeedingRefill.delete(spotIndex)
          addsUsed += 1
          addsToday += 1
          addsBySpot[spotIndex]! += 1
          addIndex = addsUsed
          releasedStreamerIds.delete(picked.playerId)
          rosteredStreamerIds.add(picked.playerId)
          seatedToday.add(picked.playerId)
          lastReleasedBySpot[spotIndex] = null
          const addedPlayer = playersById.get(picked.playerId)
          holdUntilBySpot[spotIndex] = addedPlayer
            ? holdUntilFor(addedPlayer, date)
            : date
          seatStreamerIfOpen(
            holeLineup,
            picked.playerId,
            date,
            playersById,
            schedule,
          )
          if (previousId && !forceFill && !protectedPrevious && !streamerStays) {
            markDropped(previousId, date)
          }
          if (rosterDrop?.kind === "player" && rosterDrop.playerId) {
            weekDroppedPlayers.add(rosterDrop.playerId)
            markDropped(rosterDrop.playerId, date)
            for (let other = 0; other < spotCount; other += 1) {
              if (occupants[other] !== rosterDrop.playerId) continue
              occupants[other] = null
              holdUntilBySpot[other] = null
              addedOnBySpot[other] = null
              if (other !== spotIndex) {
                afterDrop[other] = null
              }
            }
          }
        }
      }

      const stagedBreak = stagedHoldBreaks.get(spotIndex)
      if (
        holdBreakSpots.has(spotIndex) &&
        action !== "add" &&
        action !== "drop_add"
      ) {
        if (stagedBreak) {
          for (const clearedSeat of stagedBreak.cleared) {
            const row = workingDaily[clearedSeat.day]
            const entry = row?.[clearedSeat.index]
            if (entry && !entry.playerId) {
              row[clearedSeat.index] = { ...entry, playerId: stagedBreak.heldId }
            }
          }
          holdUntilBySpot[spotIndex] = stagedBreak.holdUntil
          addedOnBySpot[spotIndex] = stagedBreak.addedOn
        }
        action = "hold"
        playerId = previousId
        droppedPlayerId = null
        rosterDropPlayerId = null
        rosterDropKind = "none"
        addIndex = null
        alternativePlayerIds = []
        targetCategoryIds = []
        if (
          previousId &&
          playersById.get(previousId) &&
          playsOn(playersById.get(previousId)!, date, schedule)
        ) {
          seatStreamerIfOpen(
            holeLineup,
            previousId,
            date,
            playersById,
            schedule,
          )
          seatedToday.add(previousId)
        }
      }

      if (!playerId && previousId && !streamerStays) {
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
      if (!playerId) {
        holdUntilBySpot[spotIndex] = null
        addedOnBySpot[spotIndex] = null
      } else if (action === "add" || action === "drop_add") {
        addedOnBySpot[spotIndex] = date
      }
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

    const liveBoard = matchupBoardFromDaily(
      workingDaily,
      state.players,
      schedule,
      board,
      oppSpotCount ? oppWorkingDaily : undefined,
      window,
    )
    const hasCloseLoss =
      liveBoard.categories.some(isCloseLosingCategory) ||
      board.categories.some(isCloseLosingCategory)
    const upgradeDropFor = (occupantId: string): StreamerMoveDrop | null => {
      if (!dropProtected(occupantId)) {
        return { kind: "player", playerId: occupantId }
      }
      if (hasOpenNonIlSlot(youTeam?.entries ?? [])) {
        return { kind: "none", playerId: null }
      }
      const unavailableDropIds = new Set([...weekDroppedPlayers, occupantId])
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
        adpByPlayerId,
        board,
        statWindow: window,
        droppablePlayerIds,
      })
      if (!dropId) return null
      return { kind: "player", playerId: dropId }
    }
    const applyHeldUpgrade = (
      spotIndex: number,
      occupantId: string,
      picked: NonNullable<ReturnType<typeof pickBestStreamerMove>>,
      _drop: StreamerMoveDrop,
    ) => {
      if (dropProtected(occupantId)) return
      markDropped(occupantId, date)
      seatedToday.delete(occupantId)
      seatedToday.add(picked.playerId)
      occupants[spotIndex] = picked.playerId
      addedOnBySpot[spotIndex] = date
      const targetCategoryIds = targetCatsFromMove(
        workingDaily,
        picked.nextDaily,
      )
      workingDaily = picked.nextDaily
      addsUsed += 1
      addsToday += 1
      addsBySpot[spotIndex]! += 1
      releasedStreamerIds.delete(picked.playerId)
      rosteredStreamerIds.add(picked.playerId)
      cells[spotIndex] = {
        spotIndex,
        playerId: picked.playerId,
        action: "drop_add",
        droppedPlayerId: occupantId,
        rosterDropPlayerId: null,
        rosterDropKind: "none",
        addIndex: addsUsed,
        alternativePlayerIds: picked.alternativePlayerIds,
        targetCategoryIds,
      }
    }
    const coverSpotOrder = Array.from({ length: spotCount }, (_, index) => index)
      .sort((left, right) => {
        const leftPlayer = cells[left]?.playerId
          ? playersById.get(cells[left]!.playerId!)
          : undefined
        const rightPlayer = cells[right]?.playerId
          ? playersById.get(cells[right]!.playerId!)
          : undefined
        const leftOff = Boolean(
          leftPlayer && !playsOn(leftPlayer, date, schedule),
        )
        const rightOff = Boolean(
          rightPlayer && !playsOn(rightPlayer, date, schedule),
        )
        if (leftOff !== rightOff) return leftOff ? -1 : 1
        if (leftOff && rightOff && leftPlayer && rightPlayer) {
          return (
            remainingHoleStarts(
              leftPlayer,
              date,
              schedule.matchup.days,
              holeByDate,
              schedule,
            ) -
            remainingHoleStarts(
              rightPlayer,
              date,
              schedule.matchup.days,
              holeByDate,
              schedule,
            )
          )
        }
        return left - right
      })
    for (const spotIndex of coverSpotOrder) {
    if (lockForSpotOnDate(spotIndex, date)) continue
    const cell = cells[spotIndex]
    if (
      cell &&
      cell.action === "hold" &&
      cell.playerId &&
      forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)] !== "hold" &&
      canAffordAdd(spotIndex, true)
    ) {
      const upgradeDrop = upgradeDropFor(cell.playerId)
      if (!upgradeDrop) continue
      const occupant = playersById.get(cell.playerId)
      const heldPlaysToday = Boolean(
        occupant && playsOn(occupant, date, schedule),
      )
      if (heldPlaysToday) continue
      const heldRemaining = occupant
        ? remainingGameDays(occupant, date, schedule)
        : 0
      const isOffNight = Boolean(
        occupant && !heldPlaysToday && heldRemaining > 0,
      )
      if (occupant && heldRemaining > 0) {
      const rankedBlocks = listTodayBlocks(
        addableBlocks(date),
        date,
        seatedToday,
        playersById,
        weakCats,
        dayIndex,
        dayCount,
        false,
        window,
        adpByPlayerId,
        board,
      )
      let candidateIds = rankedBlocks.map((block) => block.playerId)
      if (isOffNight) {
        const todayFaIds = rankYouCandidates(
          addableFreeAgents(date).map((player) => player.id),
        )
        candidateIds = [...new Set([...candidateIds, ...todayFaIds])]
      } else if (heldPlaysToday) {
        const heldRank = holeDensityRank(occupant, date, schedule, holeByDate)
        const todayFaIds = rankYouCandidates(
          addableFreeAgents(date).map((player) => player.id),
        )
        candidateIds = [...new Set([...candidateIds, ...todayFaIds])].filter(
          (upgradeId) => {
            const upgradePlayer = playersById.get(upgradeId)
            if (!upgradePlayer || !playsOn(upgradePlayer, date, schedule)) {
              return false
            }
            return allowsEarlySwap(
              heldRank,
              holeDensityRank(upgradePlayer, date, schedule, holeByDate),
            )
          },
        )
      }
      const heldHoleStarts = remainingHoleStarts(
        occupant,
        date,
        schedule.matchup.days,
        holeByDate,
        schedule,
      )
      candidateIds = onlyAddable(
        rankYouCandidates(
          candidateIds.filter((upgradeId) => {
            const upgradePlayer = playersById.get(upgradeId)
            if (
              !upgradePlayer ||
              !playsOn(upgradePlayer, date, schedule) ||
              remainingGameDays(upgradePlayer, date, schedule) <= 0
            ) {
              return false
            }
            if (!isOffNight) return true
            return (
              remainingHoleStarts(
                upgradePlayer,
                date,
                schedule.matchup.days,
                holeByDate,
                schedule,
              ) > heldHoleStarts
            )
          }),
        ),
        date,
      )
      const heldDensityRank = holeDensityRank(
        occupant,
        date,
        schedule,
        holeByDate,
      )
      const isDensityUpgrade = candidateIds.some((upgradeId) => {
        const upgradePlayer = playersById.get(upgradeId)
        if (!upgradePlayer) return false
        return (
          holeDensityRank(upgradePlayer, date, schedule, holeByDate) >
          heldDensityRank
        )
      })
      let picked =
        candidateIds.length === 0
          ? null
          : pickBestStreamerMove(
              candidateIds,
              workingDaily,
              date,
              upgradeDrop,
              state.players,
              schedule,
              board,
              isCompatibleAlternative,
              ourPickOptions(
                isOffNight || isDensityUpgrade ? false : undefined,
              ),
            )
      if (!picked && heldPlaysToday && hasCloseLoss) {
        const closeLossBoard = liveBoard.categories.some(isCloseLosingCategory)
          ? liveBoard
          : board
        const closeLossCats = closeLossBoard.categories
          .filter(isCloseLosingCategory)
          .map((row) => row.categoryId)
        const closeLossHelp = (player: SeasonPlayer) =>
          closeLossCats.reduce(
            (sum, categoryId) => sum + scaledCatHelp(player, categoryId, window),
            0,
          )
        const heldCloseScore = closeLossHelp(occupant)
        const chaseIds = onlyAddable(
          rankYouCandidates(
            addableFreeAgents(date).map((player) => player.id),
            closeLossCats,
          ).filter((upgradeId) => {
            const upgradePlayer = playersById.get(upgradeId)
            return Boolean(
              upgradePlayer &&
                playsOn(upgradePlayer, date, schedule) &&
                remainingGameDays(upgradePlayer, date, schedule) > 0 &&
                closeLossHelp(upgradePlayer) > heldCloseScore,
            )
          }),
          date,
        )
        picked = pickBestStreamerMove(
          chaseIds,
          workingDaily,
          date,
          upgradeDrop,
          state.players,
          schedule,
          board,
          isCompatibleAlternative,
          ourPickOptions(false, {
            requirePositiveContestedDelta: true,
            chaseCategoryIds: closeLossCats,
          }),
        )
      }
      if (picked) {
        applyHeldUpgrade(
          spotIndex,
          cell.playerId,
          picked,
          upgradeDrop,
        )
      }
      }
    }
    }

    if (spotCount > 1) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
        if (lockForSpotOnDate(spotIndex, date)) continue
        const cell = cells[spotIndex]
        if (
          !cell ||
          cell.action !== "hold" ||
          !cell.playerId ||
          forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)] ===
            "hold" ||
          !canSpotAdd(spotIndex)
        ) {
          continue
        }
        const upgradeDrop = upgradeDropFor(cell.playerId)
        if (!upgradeDrop) continue
        const occupant = playersById.get(cell.playerId)
        if (!occupant || playsOn(occupant, date, schedule)) continue
        const heldStarts = remainingHoleStarts(
          occupant,
          date,
          schedule.matchup.days,
          holeByDate,
          schedule,
        )
        const heldScore = weakCatScore(occupant, weakCats, window)
        const heldRank = holeDensityRank(occupant, date, schedule, holeByDate)
        const upgradeIds = onlyAddable(
          rankYouCandidates(
            addableFreeAgents(date).map((player) => player.id),
          ).filter((upgradeId) => {
            if (upgradeId === cell.playerId) return false
            const upgrade = playersById.get(upgradeId)
            if (!upgrade || !playsOn(upgrade, date, schedule)) return false
            const starts = remainingHoleStarts(
              upgrade,
              date,
              schedule.matchup.days,
              holeByDate,
              schedule,
            )
            const score = weakCatScore(upgrade, weakCats, window)
            const newRank = holeDensityRank(
              upgrade,
              date,
              schedule,
              holeByDate,
            )
            return allowsMultiSpotEarlySwap(
              heldRank,
              newRank,
              dayIndex,
              dayCount,
              false,
              {
                increasesStarts: starts > heldStarts,
                improvesContested: score > heldScore,
              },
            )
          }),
          date,
        )
        if (upgradeIds.length === 0) continue
        const picked = pickBestStreamerMove(
          upgradeIds,
          workingDaily,
          date,
          upgradeDrop,
          state.players,
          schedule,
          board,
          isCompatibleAlternative,
          ourPickOptions(false),
        )
        if (!picked) continue
        applyHeldUpgrade(
          spotIndex,
          cell.playerId,
          picked,
          upgradeDrop,
        )
      }
    }

    if (spotCount > 1 && remainingDays <= 2 && addsUsed < addLimit) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
        if (addsUsed >= addLimit || addsToday >= todayAddCap) break
        if (lockForSpotOnDate(spotIndex, date)) continue
        const cell = cells[spotIndex]
        if (
          !cell ||
          cell.action !== "hold" ||
          !cell.playerId ||
          forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)] ===
            "hold" ||
          !canAffordAdd(spotIndex, true)
        ) {
          continue
        }
        const upgradeDrop = upgradeDropFor(cell.playerId)
        if (!upgradeDrop) continue
        const occupant = playersById.get(cell.playerId)
        if (!occupant || !playsOn(occupant, date, schedule)) continue
        const heldStarts = remainingHoleStarts(
          occupant,
          date,
          schedule.matchup.days,
          holeByDate,
          schedule,
        )
        const leftoverIds = onlyAddable(
          rankYouCandidates(
            addableFreeAgents(date).map((player) => player.id),
          ).filter((upgradeId) => {
            if (upgradeId === cell.playerId) return false
            const upgrade = playersById.get(upgradeId)
            if (!upgrade || !playsOn(upgrade, date, schedule)) return false
            const starts = remainingHoleStarts(
              upgrade,
              date,
              schedule.matchup.days,
              holeByDate,
              schedule,
            )
            return starts >= heldStarts
          }),
          date,
        )
        if (leftoverIds.length === 0) continue
        const picked = pickBestStreamerMove(
          leftoverIds,
          workingDaily,
          date,
          upgradeDrop,
          state.players,
          schedule,
          board,
          isCompatibleAlternative,
          ourPickOptions(false),
        )
        if (!picked) continue
        applyHeldUpgrade(
          spotIndex,
          cell.playerId,
          picked,
          upgradeDrop,
        )
      }
    }
    }

    if (!youIdle && addsUsed < addLimit) {
      const harvestBoard = matchupBoardFromDaily(
        workingDaily,
        state.players,
        schedule,
        board,
        oppSpotCount ? oppWorkingDaily : undefined,
        window,
      )
      const surplusLockIds = harvestBoard.categories
        .filter(
          (row) =>
            row.outcome === "W" &&
            row.winProb > CONTESTED_WIN_PROB_MAX &&
            !puntCategoryIds.has(row.categoryId),
        )
        .map((row) => row.categoryId)
      const harvestChaseIds = harvestBoard.categories
        .filter(
          (row) =>
            (row.outcome === "L" || row.outcome === "T") &&
            !puntCategoryIds.has(row.categoryId),
        )
        .sort((left, right) => left.winProb - right.winProb)
        .slice(0, 2)
        .map((row) => row.categoryId)
      if (surplusLockIds.length > 0 && harvestChaseIds.length > 0) {
        const lockedIds = new Set(
          forcedAdds.flatMap((lock) =>
            date >= lock.date && date <= lock.holdUntil ? [lock.playerId] : [],
          ),
        )
        const twoInThreeHeld = new Set<string>()
        for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
          const heldId = occupants[spotIndex]
          const addDate = addedOnBySpot[spotIndex]
          if (!heldId || !addDate) continue
          const held = playersById.get(heldId)
          if (!held) continue
          const blockGames = gamesInMatchupDays(held, addDate, schedule, 3)
          const lastGame = blockGames[blockGames.length - 1]
          if (blockGames.length === 2 && lastGame && date <= lastGame) {
            twoInThreeHeld.add(heldId)
          }
        }
        const remainingGameCutsToday = cells.filter((cell) => {
          if (cell?.rosterDropKind !== "player" || !cell.rosterDropPlayerId) {
            return false
          }
          const prior = playersById.get(cell.rosterDropPlayerId)
          return Boolean(
            prior && remainingGameDays(prior, date, schedule) > 0,
          )
        }).length
        const harvestDrops = (youTeam?.entries ?? [])
          .flatMap((entry) => {
            const id = entry.playerId
            if (!id || entry.slot === "IL") return []
            if (weekDroppedPlayers.has(id)) return []
            if (lockedIds.has(id) || twoInThreeHeld.has(id)) return []
            if (dropProtected(id)) return []
            const rostered = playersById.get(id)
            if (!rostered) return []
            const surplus = surplusCatScoreForGames(
              rostered,
              1,
              surplusLockIds,
              window,
            )
            const chase = weakCatScoreForGames(
              rostered,
              1,
              harvestChaseIds,
              window,
            )
            if (surplus <= 0 || surplus <= chase) return []
            return [{ id, expendable: surplus - chase }]
          })
          .sort((left, right) => right.expendable - left.expendable)
        const harvestCandidateIds = onlyAddable(
          rankYouCandidates(
            addableFreeAgents(date).map((player) => player.id),
            harvestChaseIds,
          ).filter((id) => {
            const candidate = playersById.get(id)
            return Boolean(
              candidate &&
                playsOn(candidate, date, schedule) &&
                !seatedToday.has(id),
            )
          }),
          date,
        )
        for (const dropRow of harvestDrops) {
          if (addsUsed >= addLimit) break
          const cutPlayer = playersById.get(dropRow.id)
          if (!cutPlayer) continue
          const cutRemain = remainingGameDays(cutPlayer, date, schedule)
          if (cutRemain > 0 && remainingGameCutsToday >= 2) continue
          const harvestSpot = Array.from(
            { length: spotCount },
            (_, index) => index,
          )
            .filter((spotIndex) => {
              if (lockForSpotOnDate(spotIndex, date)) return false
              if (forcedToday.has(spotIndex)) return false
              if (
                forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)] ===
                "hold"
              ) {
                return false
              }
              if (
                !canSpotSpendAdd(
                  addsUsed,
                  addLimit,
                  addsBySpot[spotIndex]!,
                  addCapForSpot(addLimit, spotCount, spotIndex),
                  true,
                )
              ) {
                return false
              }
              const occupant = occupants[spotIndex]
              if (occupant && twoInThreeHeld.has(occupant)) return false
              return occupant == null || occupant === dropRow.id
            })
            .sort((left, right) => addsBySpot[left]! - addsBySpot[right]!)[0]
          if (harvestSpot == null) continue
          const picked = pickBestStreamerMove(
            harvestCandidateIds.filter((id) => id !== dropRow.id),
            workingDaily,
            date,
            { kind: "player", playerId: dropRow.id },
            state.players,
            schedule,
            harvestBoard,
            isCompatibleAlternative,
            ourPickOptions(false, {
              requirePositiveContestedDelta: true,
              chaseCategoryIds: harvestChaseIds,
            }),
          )
          if (!picked) continue
          const afterBoard = matchupBoardFromDaily(
            picked.nextDaily,
            state.players,
            schedule,
            board,
            oppSpotCount ? oppWorkingDaily : undefined,
            window,
          )
          const locksHold = surplusLockIds.every((categoryId) => {
            const row = afterBoard.categories.find(
              (entry) => entry.categoryId === categoryId,
            )
            return (
              row?.outcome === "W" && row.winProb > CONTESTED_WIN_PROB_MAX
            )
          })
          if (!locksHold) continue
          const occupantId = occupants[harvestSpot]
          const addedPlayer = playersById.get(picked.playerId)
          let targetCategoryIds = targetCatsFromMove(
            workingDaily,
            picked.nextDaily,
          )
          if (targetCategoryIds.length === 0) {
            targetCategoryIds = harvestChaseIds.slice(0, 2)
          }
          workingDaily = picked.nextDaily
          occupants[harvestSpot] = picked.playerId
          addedOnBySpot[harvestSpot] = date
          holdUntilBySpot[harvestSpot] = addedPlayer
            ? holdUntilFor(addedPlayer, date)
            : date
          addsUsed += 1
          addsToday += 1
          addsBySpot[harvestSpot]! += 1
          weekDroppedPlayers.add(dropRow.id)
          markDropped(dropRow.id, date)
          seatedToday.delete(dropRow.id)
          seatedToday.add(picked.playerId)
          releasedStreamerIds.delete(picked.playerId)
          rosteredStreamerIds.add(picked.playerId)
          cells[harvestSpot] = {
            spotIndex: harvestSpot,
            playerId: picked.playerId,
            action: occupantId === dropRow.id ? "drop_add" : "add",
            droppedPlayerId: occupantId === dropRow.id ? dropRow.id : null,
            rosterDropPlayerId:
              occupantId === dropRow.id ? null : dropRow.id,
            rosterDropKind: occupantId === dropRow.id ? "none" : "player",
            addIndex: addsUsed,
            alternativePlayerIds: picked.alternativePlayerIds,
            targetCategoryIds,
          }
          break
        }
      }
    }

    const dayCells = cells.map((cell) => cell!)

    days.push({ date, cells: dayCells })
  }

  if (oppSpotCount && oppTeam) {
    const takenByYou = new Set(
      days.flatMap((day) =>
        day.cells
          .map((cell) => cell.playerId)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    if (takenByYou.size > 0) {
      const displayOpp = buildOpponentSelfPlan({
        oppTeam,
        oppSpotCount,
        state: {
          ...state,
          availablePlayerIds: state.availablePlayerIds.filter(
            (id) => !takenByYou.has(id),
          ),
        },
        schedule,
        board,
        addLimit,
        adpByPlayerId,
        injuryOutDaysByPlayerId,
        forcedOpponentRosterDrops,
        waiverPeriodDays,
        winnerStreamRecipes,
        today,
        statWindow: inputStatWindow,
        statPairs,
        playersById,
        rosterSlots,
      })
      opponentDays = displayOpp.days
      oppWorkingDaily = displayOpp.daily
    }
  }

  const plan: StreamingPlan = {
    spotCount,
    addLimit,
    addsUsed,
    gameStarts: 0,
    summaryReasons: buildSummaryReasons(didProtectDrops),
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
    chaseNote,
    rejectedAddLocks,
  }
  plan.gameStarts = countTeamStarts(
    applyStreamingPlanPreview(
      previewBaseDaily,
      plan,
      playersById,
      schedule,
      {
        rosterPlayerIds: (youTeam?.entries ?? []).flatMap((entry) =>
          entry.slot !== "IL" && entry.playerId ? [entry.playerId] : [],
        ),
      },
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
