import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import { buildMatchupBoard } from "./board"
import { isActiveSlot } from "./constants"
import { gameWeightForTeamDate, teamHasGameOnDate } from "./games"
import type {
  CategoryOutcome,
  MatchupBoard,
  OpponentStreamDay,
  SitStartSuggestion,
  StatWindow,
  StreamingPlanDay,
} from "./types"
import { weeklyPlayerStats } from "./weekly"

export type CategoryTotals = Record<CategoryId, number>

export type DayShootingTotals = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type DayActuals = {
  date: string
  you: CategoryTotals
  opp: CategoryTotals
  youPlayedIds: string[]
  oppPlayedIds: string[]
  youShooting: DayShootingTotals
  oppShooting: DayShootingTotals
}

export type ClosedDayRecord = {
  date: string
  youStartableIds: string[]
  oppStartableIds: string[]
  youActual: CategoryTotals
  oppActual: CategoryTotals
  youPlayedIds: string[]
  oppPlayedIds: string[]
  youShooting: DayShootingTotals
  oppShooting: DayShootingTotals
}

export type DayComparisonRow = {
  date: string
  youProjection: CategoryTotals
  youActual: CategoryTotals
  oppProjection: CategoryTotals
  oppActual: CategoryTotals
}

const emptyShooting = (): DayShootingTotals => ({
  FGM: 0,
  FGA: 0,
  FTM: 0,
  FTA: 0,
})

const dateHasNbaGame = (date: string, schedule: ScheduleResponse): boolean =>
  schedule.games.some((game) => game.date === date)

const sumCountingTotals = (rows: CategoryTotals[]): CategoryTotals => {
  const next = emptyCategoryTotals()
  for (const row of rows) {
    for (const categoryId of COUNTING_CATEGORIES) {
      next[categoryId] += row[categoryId]
    }
  }
  return next
}

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

export const emptyCategoryTotals = (): CategoryTotals =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as CategoryTotals

export const startableIdsOnDate = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
): string[] =>
  entries.flatMap((entry) => {
    if (!isActiveSlot(entry.slot) || !entry.playerId) return []
    const player = playersById.get(entry.playerId)
    if (!player?.teamAbbr) return []
    if (!teamHasGameOnDate(player.teamAbbr, date, schedule)) return []
    return [entry.playerId]
  })

export const projectDayTotals = (
  playerIds: string[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): CategoryTotals => {
  const totals = emptyCategoryTotals()
  let fgm = 0
  let fga = 0
  let ftm = 0
  let fta = 0

  for (const playerId of playerIds) {
    const player = playersById.get(playerId)
    if (!player?.teamAbbr) continue
    const games = gameWeightForTeamDate(
      player.teamAbbr,
      date,
      schedule,
      undefined,
      playerId,
    )
    if (games <= 0) continue
    const weekly = weeklyPlayerStats(player, games, statWindow)
    for (const categoryId of COUNTING_CATEGORIES) {
      totals[categoryId] += weekly.projections[categoryId]
    }
    fgm += weekly.shooting.FGM
    fga += weekly.shooting.FGA
    ftm += weekly.shooting.FTM
    fta += weekly.shooting.FTA
  }

  totals.FG_PCT = fga > 0 ? fgm / fga : 0
  totals.FT_PCT = fta > 0 ? ftm / fta : 0
  return totals
}

export const closeFinishedDays = (input: {
  matchupDays: string[]
  today: string
  previousClosed: ClosedDayRecord[]
  actualsByDate: Map<string, DayActuals>
  schedule: ScheduleResponse
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
}): { closedDays: ClosedDayRecord[]; actualsPending: boolean } => {
  const previousByDate = new Map(
    input.previousClosed.map((day) => [day.date, day]),
  )
  let actualsPending = false
  const closedDays: ClosedDayRecord[] = []

  for (const date of input.matchupDays) {
    if (date >= input.today) continue
    const previous = previousByDate.get(date)
    const actuals = input.actualsByDate.get(date)
    const noGames = !dateHasNbaGame(date, input.schedule)

    if (!previous && !actuals && !noGames) {
      actualsPending = true
      continue
    }

    const youActual =
      actuals?.you ?? previous?.youActual ?? emptyCategoryTotals()
    const oppActual =
      actuals?.opp ?? previous?.oppActual ?? emptyCategoryTotals()
    closedDays.push({
      date,
      youStartableIds:
        previous?.youStartableIds ??
        startableIdsOnDate(
          input.youEntries,
          input.playersById,
          date,
          input.schedule,
        ),
      oppStartableIds:
        previous?.oppStartableIds ??
        startableIdsOnDate(
          input.oppEntries,
          input.playersById,
          date,
          input.schedule,
        ),
      youActual,
      oppActual,
      youPlayedIds: actuals?.youPlayedIds ?? previous?.youPlayedIds ?? [],
      oppPlayedIds: actuals?.oppPlayedIds ?? previous?.oppPlayedIds ?? [],
      youShooting:
        actuals?.youShooting ?? previous?.youShooting ?? emptyShooting(),
      oppShooting:
        actuals?.oppShooting ?? previous?.oppShooting ?? emptyShooting(),
    })
  }

  return { closedDays, actualsPending }
}

export const dayComparisonRows = (
  closedDays: ClosedDayRecord[],
  playersById: Map<string, SeasonPlayer>,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): DayComparisonRow[] =>
  closedDays.map((day) => ({
    date: day.date,
    youProjection: projectDayTotals(
      day.youStartableIds,
      playersById,
      day.date,
      schedule,
      statWindow,
    ),
    youActual: day.youActual,
    oppProjection: projectDayTotals(
      day.oppStartableIds,
      playersById,
      day.date,
      schedule,
      statWindow,
    ),
    oppActual: day.oppActual,
  }))

const shootingForStartableIdsOnDate = (
  entries: SeasonRosterEntry[],
  playersById: Map<string, SeasonPlayer>,
  date: string,
  schedule: ScheduleResponse,
  statWindow: StatWindow,
): DayShootingTotals => {
  const ids = startableIdsOnDate(entries, playersById, date, schedule)
  let fgm = 0
  let fga = 0
  let ftm = 0
  let fta = 0
  for (const playerId of ids) {
    const player = playersById.get(playerId)
    if (!player?.teamAbbr) continue
    const games = gameWeightForTeamDate(
      player.teamAbbr,
      date,
      schedule,
      undefined,
      playerId,
    )
    if (games <= 0) continue
    const weekly = weeklyPlayerStats(player, games, statWindow)
    fgm += weekly.shooting.FGM
    fga += weekly.shooting.FGA
    ftm += weekly.shooting.FTM
    fta += weekly.shooting.FTA
  }
  return { FGM: fgm, FGA: fga, FTM: ftm, FTA: fta }
}

const sumShooting = (rows: DayShootingTotals[]): DayShootingTotals =>
  rows.reduce(
    (acc, row) => ({
      FGM: acc.FGM + row.FGM,
      FGA: acc.FGA + row.FGA,
      FTM: acc.FTM + row.FTM,
      FTA: acc.FTA + row.FTA,
    }),
    emptyShooting(),
  )

const blendSideTotals = (input: {
  closedDays: ClosedDayRecord[]
  remainingDates: string[]
  entries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
  schedule: ScheduleResponse
  statWindow: StatWindow
  side: "you" | "opp"
}): CategoryTotals => {
  const actualKey = input.side === "you" ? "youActual" : "oppActual"
  const shootingKey = input.side === "you" ? "youShooting" : "oppShooting"
  const closedActuals = input.closedDays.map((day) => day[actualKey])
  const closedShooting = input.closedDays.map((day) => day[shootingKey])
  const remainingProjections = input.remainingDates.map((date) =>
    projectDayTotals(
      startableIdsOnDate(
        input.entries,
        input.playersById,
        date,
        input.schedule,
      ),
      input.playersById,
      date,
      input.schedule,
      input.statWindow,
    ),
  )
  const remainingShooting = input.remainingDates.map((date) =>
    shootingForStartableIdsOnDate(
      input.entries,
      input.playersById,
      date,
      input.schedule,
      input.statWindow,
    ),
  )
  const totals = sumCountingTotals([...closedActuals, ...remainingProjections])
  const shooting = sumShooting([...closedShooting, ...remainingShooting])
  totals.FG_PCT = shooting.FGA > 0 ? shooting.FGM / shooting.FGA : 0
  totals.FT_PCT = shooting.FTA > 0 ? shooting.FTM / shooting.FTA : 0
  return totals
}

export const blendWeekTotals = (input: {
  closedDays: ClosedDayRecord[]
  remainingDates: string[]
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  playersById: Map<string, SeasonPlayer>
  schedule: ScheduleResponse
  statWindow: StatWindow
}): { you: CategoryTotals; opp: CategoryTotals } => ({
  you: blendSideTotals({
    closedDays: input.closedDays,
    remainingDates: input.remainingDates,
    entries: input.youEntries,
    playersById: input.playersById,
    schedule: input.schedule,
    statWindow: input.statWindow,
    side: "you",
  }),
  opp: blendSideTotals({
    closedDays: input.closedDays,
    remainingDates: input.remainingDates,
    entries: input.oppEntries,
    playersById: input.playersById,
    schedule: input.schedule,
    statWindow: input.statWindow,
    side: "opp",
  }),
})

export const blendedMatchupBoard = (
  totals: { you: CategoryTotals; opp: CategoryTotals },
  categoryIds: CategoryId[],
): MatchupBoard => buildMatchupBoard(totals.you, totals.opp, categoryIds)

export type MorningPlanSnapshot = {
  outcomes: Record<CategoryId, CategoryOutcome>
  opponentRosterIds: string[]
  opponentDays: OpponentStreamDay[]
  ourDays: StreamingPlanDay[]
  sitStart: SitStartSuggestion[]
}

export type MorningSummary = {
  categories: Array<{
    categoryId: CategoryId
    outcome: CategoryOutcome
    flipped: boolean
  }>
  opponentMoves: string[]
  ourAbsences: string[]
  recommendationChanges: string[]
  recommendationsUnchanged: boolean
  todayRecommendations: string[]
  actualsPending: boolean
}

export const outcomesFromBoard = (
  board: MatchupBoard,
): Record<CategoryId, CategoryOutcome> => {
  const boardOutcomes = new Map(
    board.categories.map((row) => [row.categoryId, row.outcome]),
  )
  return Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [
      categoryId,
      boardOutcomes.get(categoryId) ?? "T",
    ]),
  ) as Record<CategoryId, CategoryOutcome>
}

const actionKey = (
  date: string,
  action: string,
  playerId: string | null,
  droppedPlayerId: string | null,
) =>
  `${date} ${action} ${playerId ?? "none"} drop ${droppedPlayerId ?? "none"}`

const planActionLines = (days: StreamingPlanDay[], today: string): string[] =>
  days.flatMap((day) => {
    if (day.date < today) return []
    return day.cells
      .filter((cell) => cell.action === "add" || cell.action === "drop_add")
      .map((cell) =>
        actionKey(
          day.date,
          cell.action,
          cell.playerId,
          cell.droppedPlayerId,
        ),
      )
  })

const sitLines = (sitStart: SitStartSuggestion[], today: string): string[] =>
  sitStart.map(
    (swap) =>
      `${today} sit ${swap.activePlayerId} start ${swap.benchPlayerId}`,
  )

export const buildMorningSummary = (input: {
  board: MatchupBoard
  previous: MorningPlanSnapshot | null
  closedDays: ClosedDayRecord[]
  currentOpponentRosterIds: string[]
  ourDays: StreamingPlanDay[]
  opponentDays: OpponentStreamDay[]
  sitStart: SitStartSuggestion[]
  outPlayerIds: string[]
  today: string
  actualsPending: boolean
}): MorningSummary => {
  const boardOutcomes = new Map(
    input.board.categories.map((row) => [row.categoryId, row.outcome]),
  )
  const categories = ALL_CATEGORY_IDS.map((categoryId) => {
    const outcome = boardOutcomes.get(categoryId) ?? "T"
    return {
      categoryId,
      outcome,
      flipped: input.previous
        ? input.previous.outcomes[categoryId] !== outcome
        : false,
    }
  })

  const previousRoster = new Set(input.previous?.opponentRosterIds ?? [])
  const currentRoster = new Set(input.currentOpponentRosterIds)
  const opponentMoves: string[] = []
  if (input.previous) {
    for (const playerId of input.currentOpponentRosterIds) {
      if (!previousRoster.has(playerId)) opponentMoves.push(`added ${playerId}`)
    }
    const savedOpponentDaysBeforeToday = input.previous.opponentDays.filter(
      (day) => day.date < input.today,
    )
    const expectedDrops = new Set(
      savedOpponentDaysBeforeToday.flatMap((day) =>
        day.cells.flatMap((cell) =>
          cell.droppedPlayerId ? [cell.droppedPlayerId] : [],
        ),
      ),
    )
    for (const playerId of input.previous.opponentRosterIds) {
      if (!currentRoster.has(playerId) && !expectedDrops.has(playerId)) {
        opponentMoves.push(`dropped ${playerId}`)
      }
    }
    const expectedAdds = new Set(
      savedOpponentDaysBeforeToday.flatMap((day) =>
        day.cells
          .filter((cell) => cell.action === "add" || cell.action === "drop_add")
          .flatMap((cell) => (cell.playerId ? [cell.playerId] : [])),
      ),
    )
    for (const playerId of expectedAdds) {
      if (!currentRoster.has(playerId) && !previousRoster.has(playerId)) {
        opponentMoves.push(`missed add ${playerId}`)
      }
    }
  }

  const outIds = new Set(input.outPlayerIds)
  const ourAbsences: string[] = []
  if (input.previous) {
    for (const day of input.previous.ourDays) {
      if (day.date < input.today) continue
      for (const cell of day.cells) {
        if (cell.playerId && outIds.has(cell.playerId)) {
          ourAbsences.push(`out ${cell.playerId}`)
        }
      }
    }
  }
  for (const day of input.closedDays) {
    const played = new Set(day.youPlayedIds)
    for (const playerId of day.youStartableIds) {
      if (!played.has(playerId)) {
        ourAbsences.push(`did not play ${playerId} on ${day.date}`)
      }
    }
  }

  const todayRecommendations = [
    ...planActionLines(
      input.ourDays.filter((day) => day.date === input.today),
      input.today,
    ),
    ...sitLines(input.sitStart, input.today),
  ].slice(0, 3)

  const hasFact =
    categories.some((row) => row.flipped) ||
    opponentMoves.length > 0 ||
    ourAbsences.length > 0

  let recommendationChanges: string[] = []
  let recommendationsUnchanged = false
  if (input.previous && hasFact) {
    const previousPlanLines = [
      ...planActionLines(input.previous.ourDays, input.today),
      ...sitLines(input.previous.sitStart, input.today),
    ]
    const nextPlanLines = [
      ...planActionLines(input.ourDays, input.today),
      ...sitLines(input.sitStart, input.today),
    ]
    const previousSet = new Set(previousPlanLines)
    const nextSet = new Set(nextPlanLines)
    const symmetricDiff = [
      ...nextPlanLines.filter((line) => !previousSet.has(line)),
      ...previousPlanLines.filter((line) => !nextSet.has(line)),
    ]
    const todayFirst = [
      ...symmetricDiff.filter((line) => line.startsWith(input.today)),
      ...symmetricDiff.filter((line) => !line.startsWith(input.today)),
    ]
    recommendationChanges = todayFirst.slice(0, 3)
    recommendationsUnchanged = symmetricDiff.length === 0
  }

  return {
    categories,
    opponentMoves: input.previous ? opponentMoves : [],
    ourAbsences,
    recommendationChanges,
    recommendationsUnchanged,
    todayRecommendations: input.previous ? [] : todayRecommendations,
    actualsPending: input.actualsPending,
  }
}
