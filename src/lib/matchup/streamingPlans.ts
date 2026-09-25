import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { MATCHUP_CATEGORY_SIGMOID_SCALE, SURPLUS_WIN_PROB } from "./constants"
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
  chaseCategoryIds,
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
  WinnerStreamRecipe,
} from "./types"
import {
  findStreamingBlocks,
  type StreamingBlock,
} from "./streamingBlocks"
import {
  chooseIlVersusNewInjuredDrop,
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
import { teamHasGameOnDate } from "./games"
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

const weakCategories = (
  board: MatchupBoard,
  puntCategoryIds: ReadonlySet<CategoryId> = new Set(),
): CategoryId[] => chaseCategoryIds(board, puntCategoryIds)

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
): boolean => {
  if (!player.teamAbbr) return false
  return teamHasGameOnDate(player.teamAbbr, date, schedule)
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
      return left.player.id.localeCompare(right.player.id)
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
  return left.playerId.localeCompare(right.playerId)
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
): StreamingBlock[] => {
  const candidates = blocks
    .filter((block) => block.startDate === date && !seatedIds.has(block.playerId))
    .filter((block) => block.remainingWeekGames > 0)
    .sort((left, right) =>
      compareBlocks(left, right, playersById, weakCats, budgetBehind, window),
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
    summaryReasons.push("Protected ADP ≤ 60")
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
    .filter((p) => !playsOn(p, date, schedule))

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
    return teamHasGameOnDate(player.teamAbbr, date, schedule)
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
  dayIndex,
  dayCount,
  assignments,
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
  dayIndex: number
  dayCount: number
  assignments: SpotBlockAssignment[][]
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
  const remainingDays = dayCount - dayIndex
  let todayAddCap = dailyAddPaceLimit(addLimit - addsUsed, remainingDays)
  let addsToday = 0
  const assignmentStartingToday = (spotIndex: number) =>
    assignments[spotIndex]?.find((block) => block.startDate === date)
  const holdHoleByDate = Object.fromEntries(
    schedule.matchup.days.map((day) => [
      day,
      buildHoleDayLineup({
        day,
        teamEntries: oppEntries,
        players,
        schedule,
        cutPlayerIds: weekDropped,
        savedDay: undefined,
        rosterSlots,
      }),
    ]),
  )

  const needFill: number[] = []
  for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
    const playerId = occupants[spotIndex]
    const player = playerId ? playersById.get(playerId) : undefined
    const keepHold =
      spotCount > 1 &&
      Boolean(player) &&
      remainingGameDays(player!, date, schedule) > 0 &&
      remainingHoleStarts(
        player!,
        date,
        schedule.matchup.days,
        holdHoleByDate,
        schedule,
      ) > 0 &&
      (playsOn(player!, date, schedule) ||
        isInsideHeldStreamingWindow(player!, date, schedule, holdHoleByDate))
    if (keepHold) continue
    occupants[spotIndex] = null
    needFill.push(spotIndex)
  }
  todayAddCap = dailyAddPaceLimit(
    addLimit - addsUsed,
    remainingDays,
    occupants.filter((id) => !id).length,
  )

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
  candidateIds = rankedCandidates.map((player) => player.id)
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
    if (nextAddsUsed >= addLimit || addsToday >= todayAddCap) {
      occupants[spotIndex] = null
      continue
    }
    const reservedIds = new Set(takenToday)
    for (const id of occupants) {
      if (id) reservedIds.add(id)
    }
    for (let other = 0; other < spotCount; other += 1) {
      if (other === spotIndex || occupants[other]) continue
      const reserved = assignmentStartingToday(other)?.playerId
      if (reserved) reservedIds.add(reserved)
    }
    const plannedAddId = assignmentStartingToday(spotIndex)?.playerId
    const previousId = previousOccupants[spotIndex] ?? null
    const leftoverIds = [
      ...(plannedAddId && !reservedIds.has(plannedAddId)
        ? [plannedAddId]
        : []),
      ...candidateIds.filter(
        (id) => id !== plannedAddId && !reservedIds.has(id),
      ),
    ]
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
          chaseCategoryIds: weakCats,
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
      addsToday += 1
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
    if (nextAddsUsed >= addLimit || addsToday >= todayAddCap) break
    const heldId = occupants[spotIndex]
    if (!heldId) continue
    const held = playersById.get(heldId)
    if (!held) continue
    if (playsOn(held, date, schedule)) continue
    if (remainingGameDays(held, date, schedule) <= 0) continue
    const heldStarts = remainingHoleStarts(
      held,
      date,
      schedule.matchup.days,
      holeByDate,
      schedule,
    )
    const occupantIds = new Set(
      occupants.filter((id): id is string => Boolean(id)),
    )
    const leftoverIds = candidateIds.filter((id) => {
      if (takenToday.has(id) || occupantIds.has(id)) return false
      const player = playersById.get(id)
      if (!player || !playsOn(player, date, schedule)) return false
      return (
        remainingHoleStarts(
          player,
          date,
          schedule.matchup.days,
          holeByDate,
          schedule,
        ) > heldStarts
      )
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
        chaseCategoryIds: weakCats,
      },
    )
    if (!picked) continue
    workingDaily = picked.nextDaily
    occupants[spotIndex] = picked.playerId
    justAdded = picked.playerId
    justDropped = heldId
    droppedBySpot.set(spotIndex, heldId)
    nextAddsUsed += 1
    addsToday += 1
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
  const oppOccupants: (string | null)[] = Array.from(
    { length: oppSpotCount ?? 0 },
    () => null,
  )
  const isTakenByOpponent = (playerId: string) =>
    oppOccupants.includes(playerId)
  const addableFreeAgents = (date: string) =>
    freeAgents.filter(
      (player) =>
        canAddPlayer(player.id, date) && !isTakenByOpponent(player.id),
    )
  const onlyAddable = (playerIds: string[], date: string) =>
    playerIds.filter(
      (playerId) =>
        canAddPlayer(playerId, date) && !isTakenByOpponent(playerId),
    )

  const blocks = findStreamingBlocks(freeAgents, schedule)
  const addableBlocks = (date: string) =>
    blocks.filter(
      (block) =>
        canAddPlayer(block.playerId, date) &&
        !isTakenByOpponent(block.playerId),
    )
  const puntCategoryIds = new Set(
    state.categories
      .filter((category) => category.weight === 0)
      .map((category) => category.id),
  )
  const weakCats = weakCategories(board, puntCategoryIds)
  const occupants: (string | null)[] = Array.from({ length: spotCount }, () => null)
  const holdUntilBySpot: (string | null)[] = Array.from(
    { length: spotCount },
    () => null,
  )
  const holdUntilFor = (player: SeasonPlayer, fromDate: string) => {
    const windowDays = schedule.matchup.days
      .filter((day) => day >= fromDate)
      .slice(0, 4)
    const games = windowDays.filter((day) => playsOn(player, day, schedule))
    if (spotCount === 1) return fromDate
    if (spotCount === 3) return games[games.length - 1] ?? fromDate
    return games[1] ?? games[0] ?? fromDate
  }
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
  const oppTeam =
    typeof opponentTeamIndex === "number"
      ? state.teams.find((team) => team.teamIndex === opponentTeamIndex)
      : state.teams.find((_, index) => index !== state.perspectiveTeamIndex)
  const youAssignedIds = new Set(
    youIdle
      ? []
      : spotBlockTimelines.flatMap((timeline, spotIndex) => {
          const first = timeline[0]
          if (!first) return []
          if (
            forcedRosterDrops?.[
              streamingAddDropKey(first.startDate, spotIndex)
            ] === "hold"
          ) {
            return []
          }
          return [first.playerId]
        }),
  )
  const oppInitialHoleByDate = Object.fromEntries(
    schedule.matchup.days.map((day) => [
      day,
      buildHoleDayLineup({
        day,
        teamEntries: oppTeam?.entries ?? [],
        players: state.players,
        schedule,
        savedDay: undefined,
        rosterSlots,
      }),
    ]),
  )
  const oppSpotBlockTimelines = oppSpotCount
    ? assignSpotBlockTimelines(
        oppSpotCount,
        addLimit,
        blocks.filter((block) => !youAssignedIds.has(block.playerId)),
        schedule.matchup.days,
        playersById,
        weakCats,
        oppInitialHoleByDate,
        schedule,
        window,
      )
    : []
  let oppWorkingDaily: DailyLineups = oppSpotCount
    ? initDailyLineups(
        schedule.matchup.days,
        oppTeam?.entries ?? [],
        rosterSlots,
        state.players,
        schedule,
      )
    : {}
  let oppAddsUsed = 0
  const oppWeekDropped = new Set<string>()
  const oppRosterDroppedSpots = new Set<number>()
  const opponentDays: OpponentStreamDay[] = []
  let pickHoleDate = schedule.matchup.days[0] ?? ""
  let pickHoleByDate: Record<string, SeasonRosterEntry[]> = {}
  const ourPickOptions = (
    requirePositiveDelta?: boolean,
    extras?: {
      requirePositiveContestedDelta?: boolean
      chaseCategoryIds?: CategoryId[]
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
    } = {
      recipes: winnerStreamRecipes,
      statWindow: window,
      chaseCategoryIds: extras?.chaseCategoryIds ?? weakCats,
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
            return left.id.localeCompare(right.id)
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
      )
    }

    const rankYouCandidates = (
      candidateIds: string[],
      targetWeakCats = weakCats,
    ) => rankAllYouCandidates(candidateIds, targetWeakCats).map((player) => player.id)

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
    // Pass 1: keep a 2-in-3 / 3-in-4 add through its off night, then drop
    // when the window is over so the next dense block can start.
    afterDrop = occupants.map((playerId, spotIndex) => {
      if (spotCount === 1) {
        if (playerId) {
          clearPlannedOccupant(playerId, date)
          lastReleasedBySpot[spotIndex] = playerId
        }
        holdUntilBySpot[spotIndex] = null
        holdExpiredBySpot[spotIndex] = true
        return null
      }
      const occupant = playerId ? playersById.get(playerId) : undefined
      const holdUntil = holdUntilBySpot[spotIndex]
      if (holdUntil && date > holdUntil) {
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
        const offNight = afterDrop.findIndex((playerId) => Boolean(playerId))
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
    for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
      const heldId = afterDrop[spotIndex]
      const held = heldId ? playersById.get(heldId) : undefined
      const heldPlaysToday = Boolean(
        held && playsOn(held, date, schedule),
      )
      if (
        heldId &&
        held &&
        !heldPlaysToday &&
        !forceFillForSpot(spotIndex) &&
        isInsideHeldStreamingWindow(held, date, schedule, holeByDate)
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
        if (countOpenActiveSlots(holeLineup) <= 0) {
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
        )
        const todayFaIds = addableFreeAgents(date).map((player) => player.id)
        const leftoverFaIds =
          spotCount === 1 && previousId
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
              const result = tryMove({ kind: "player", playerId: dropId }, false)
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
          addsToday += 1
          addsBySpot[spotIndex]! += 1
          addIndex = addsUsed
          releasedStreamerIds.delete(picked.playerId)
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
      if (!playerId) holdUntilBySpot[spotIndex] = null
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
    const cell = cells[spotIndex]
    if (
      cell &&
      cell.action === "hold" &&
      cell.playerId &&
      forcedRosterDrops?.[streamingAddDropKey(date, spotIndex)] !== "hold" &&
      canAffordAdd(spotIndex, true)
    ) {
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
              { kind: "player", playerId: cell.playerId },
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
          { kind: "player", playerId: cell.playerId },
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
        markDropped(cell.playerId, date)
        seatedToday.delete(cell.playerId)
        seatedToday.add(picked.playerId)
        occupants[spotIndex] = picked.playerId
        const targetCategoryIds = targetCatsFromMove(
          workingDaily,
          picked.nextDaily,
        )
        workingDaily = picked.nextDaily
        addsUsed += 1
        addsToday += 1
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
    }
    }

    if (spotCount > 1) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
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
          { kind: "player", playerId: cell.playerId },
          state.players,
          schedule,
          board,
          isCompatibleAlternative,
          ourPickOptions(false),
        )
        if (!picked) continue
        markDropped(cell.playerId, date)
        seatedToday.delete(cell.playerId)
        seatedToday.add(picked.playerId)
        occupants[spotIndex] = picked.playerId
        const targetCategoryIds = targetCatsFromMove(
          workingDaily,
          picked.nextDaily,
        )
        workingDaily = picked.nextDaily
        addsUsed += 1
        addsToday += 1
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

    if (spotCount > 1 && remainingDays <= 2 && addsUsed < addLimit) {
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex += 1) {
        if (addsUsed >= addLimit || addsToday >= todayAddCap) break
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
          { kind: "player", playerId: cell.playerId },
          state.players,
          schedule,
          board,
          isCompatibleAlternative,
          ourPickOptions(false),
        )
        if (!picked) continue
        markDropped(cell.playerId, date)
        seatedToday.delete(cell.playerId)
        seatedToday.add(picked.playerId)
        occupants[spotIndex] = picked.playerId
        const targetCategoryIds = targetCatsFromMove(
          workingDaily,
          picked.nextDaily,
        )
        workingDaily = picked.nextDaily
        addsUsed += 1
        addsToday += 1
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
        dayIndex,
        dayCount,
        assignments: oppSpotBlockTimelines,
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
