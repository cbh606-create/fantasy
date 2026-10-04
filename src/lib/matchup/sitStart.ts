import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { eligibleForSlot } from "@/lib/matchup/eligibility"
import { teamHasGameOnDate } from "@/lib/matchup/games"
import { buildMatchupBoard } from "./board"
import { isActiveSlot, MAX_SIT_START } from "./constants"
import type { DailyLineups } from "./dailyLineups"
import type { SitStartSuggestion, SitStartSwap, StatWindow } from "./types"
import { activeTeamWeeklyTotals } from "./weekly"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

type SuggestSitStartInput = {
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  players: SeasonPlayer[]
  gamesMap: Map<string, number>
  categoryIds?: CategoryId[]
  statWindow?: StatWindow
}

const playersById = (players: SeasonPlayer[]): Map<string, SeasonPlayer> =>
  new Map(players.map((player) => [player.id, player]))

const swapFilledEntries = (
  entries: SeasonRosterEntry[],
  benchPlayerId: string,
  activePlayerId: string,
): SeasonRosterEntry[] | null => {
  let benchIndex = -1
  let activeIndex = -1

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (entry.playerId === benchPlayerId && entry.slot === "BE") {
      benchIndex = index
    }
    if (entry.playerId === activePlayerId && isActiveSlot(entry.slot)) {
      activeIndex = index
    }
  }

  if (benchIndex < 0 || activeIndex < 0) return null

  return entries.map((entry, index) => {
    if (index === benchIndex) return { ...entry, playerId: activePlayerId }
    if (index === activeIndex) return { ...entry, playerId: benchPlayerId }
    return entry
  })
}

const projectedCatWins = (
  youEntries: SeasonRosterEntry[],
  oppEntries: SeasonRosterEntry[],
  playerMap: Map<string, SeasonPlayer>,
  gamesMap: Map<string, number>,
  categoryIds: CategoryId[],
  statWindow: StatWindow = "season",
): number => {
  const youTotals = activeTeamWeeklyTotals(
    youEntries,
    playerMap,
    gamesMap,
    statWindow,
  )
  const oppTotals = activeTeamWeeklyTotals(
    oppEntries,
    playerMap,
    gamesMap,
    statWindow,
  )
  return buildMatchupBoard(youTotals, oppTotals, categoryIds).projectedCatWins
}

const formatReason = (delta: number, benchGames: number): string => {
  const sign = delta >= 0 ? "+" : ""
  return `${sign}${delta.toFixed(2)} cat wins · ${benchGames} games`
}

export const suggestSitStart = ({
  youEntries,
  oppEntries,
  players,
  gamesMap,
  categoryIds = ALL_CATEGORY_IDS,
  statWindow = "season",
}: SuggestSitStartInput): SitStartSuggestion[] => {
  const playerMap = playersById(players)
  const baseline = projectedCatWins(
    youEntries,
    oppEntries,
    playerMap,
    gamesMap,
    categoryIds,
    statWindow,
  )

  const benchPlayerIds = youEntries
    .filter((entry) => entry.slot === "BE" && entry.playerId)
    .map((entry) => entry.playerId as string)

  const activePlayerIds = youEntries
    .filter((entry) => isActiveSlot(entry.slot) && entry.playerId)
    .map((entry) => entry.playerId as string)

  const candidates: SitStartSuggestion[] = []

  for (const benchPlayerId of benchPlayerIds) {
    for (const activePlayerId of activePlayerIds) {
      const activeEntry = youEntries.find(
        (entry) =>
          entry.playerId === activePlayerId && isActiveSlot(entry.slot),
      )
      if (!activeEntry) continue

      const benchPlayer = playerMap.get(benchPlayerId)
      const activePlayer = playerMap.get(activePlayerId)
      if (!eligibleForSlot(benchPlayer, activeEntry.slot)) continue
      if (!eligibleForSlot(activePlayer, "BE")) continue

      const swapped = swapFilledEntries(youEntries, benchPlayerId, activePlayerId)
      if (!swapped) continue

      const nextProjected = projectedCatWins(
        swapped,
        oppEntries,
        playerMap,
        gamesMap,
        categoryIds,
        statWindow,
      )
      const deltaProjectedCatWins = nextProjected - baseline
      if (deltaProjectedCatWins <= 0) continue

      candidates.push({
        benchPlayerId,
        activePlayerId,
        deltaProjectedCatWins,
        reason: formatReason(deltaProjectedCatWins, gamesMap.get(benchPlayerId) ?? 0),
      })
    }
  }

  return candidates
    .sort((left, right) => {
      if (right.deltaProjectedCatWins !== left.deltaProjectedCatWins) {
        return right.deltaProjectedCatWins - left.deltaProjectedCatWins
      }
      return left.benchPlayerId.localeCompare(right.benchPlayerId)
    })
    .slice(0, MAX_SIT_START)
}

export const applySitStartSwap = (
  entries: SeasonRosterEntry[],
  swap: SitStartSwap,
  players: SeasonPlayer[],
): SeasonRosterEntry[] | { error: "stale_lineup" | "ineligible" } => {
  const activeEntry = entries.find(
    (entry) =>
      entry.playerId === swap.activePlayerId && isActiveSlot(entry.slot),
  )
  const benchPlayer = players.find(
    (player) => player.id === swap.benchPlayerId,
  )
  if (activeEntry && !eligibleForSlot(benchPlayer, activeEntry.slot)) {
    return { error: "ineligible" }
  }

  const next = swapFilledEntries(entries, swap.benchPlayerId, swap.activePlayerId)
  if (!next) return { error: "stale_lineup" }
  return next
}

export const sitStartBadgeKey = (date: string, playerId: string) =>
  `${date}:${playerId}`

export type SitStartDisplayInput = {
  days: string[]
  schedule: ScheduleResponse
  playersById: Record<string, SeasonPlayer> | Map<string, SeasonPlayer>
  youEntries: SeasonRosterEntry[]
  daily?: DailyLineups
  droppedFromByPlayerId?: Record<string, string>
}

const resolveDisplayPlayer = (
  playersById: SitStartDisplayInput["playersById"],
  playerId: string,
): SeasonPlayer | undefined =>
  playersById instanceof Map ? playersById.get(playerId) : playersById[playerId]

const playerStillOnDate = (
  playerId: string,
  date: string,
  youEntries: SeasonRosterEntry[],
  droppedFromByPlayerId: Record<string, string>,
): boolean => {
  const droppedFrom = droppedFromByPlayerId[playerId]
  if (droppedFrom && date >= droppedFrom) return false
  return youEntries.some(
    (entry) => entry.playerId === playerId && entry.slot !== "IL",
  )
}

const occupantHasNoGame = (
  playerId: string | null,
  date: string,
  schedule: ScheduleResponse,
  playersById: SitStartDisplayInput["playersById"],
): boolean => {
  if (!playerId) return true
  const occupant = resolveDisplayPlayer(playersById, playerId)
  if (!occupant?.teamAbbr) return true
  return !teamHasGameOnDate(occupant.teamAbbr, date, schedule)
}

const benchCanEnterOnDate = (
  suggestion: SitStartSuggestion,
  date: string,
  youEntries: SeasonRosterEntry[],
  daily: DailyLineups | undefined,
  playersById: SitStartDisplayInput["playersById"],
  schedule: ScheduleResponse,
): boolean => {
  const bench = resolveDisplayPlayer(playersById, suggestion.benchPlayerId)
  const activeEntry = youEntries.find(
    (entry) =>
      entry.playerId === suggestion.activePlayerId && isActiveSlot(entry.slot),
  )
  if (!bench || !activeEntry) return false
  if (!eligibleForSlot(bench, activeEntry.slot)) return false
  if (!eligibleForSlot(resolveDisplayPlayer(playersById, suggestion.activePlayerId), "BE")) {
    return false
  }

  const dayEntries = daily?.[date]
  if (!dayEntries) return true
  if (dayEntries.some((entry) => entry.playerId === suggestion.benchPlayerId)) {
    return true
  }
  return dayEntries.some((entry) => {
    if (!eligibleForSlot(bench, entry.slot)) return false
    if (entry.playerId === suggestion.activePlayerId) return true
    return occupantHasNoGame(entry.playerId, date, schedule, playersById)
  })
}

export const sitStartSwapAppliesOnDate = (
  suggestion: SitStartSuggestion,
  date: string,
  input: SitStartDisplayInput,
): boolean => {
  const droppedFromByPlayerId = input.droppedFromByPlayerId ?? {}
  if (
    !playerStillOnDate(
      suggestion.benchPlayerId,
      date,
      input.youEntries,
      droppedFromByPlayerId,
    )
  ) {
    return false
  }
  if (
    !playerStillOnDate(
      suggestion.activePlayerId,
      date,
      input.youEntries,
      droppedFromByPlayerId,
    )
  ) {
    return false
  }

  const bench = resolveDisplayPlayer(input.playersById, suggestion.benchPlayerId)
  const active = resolveDisplayPlayer(input.playersById, suggestion.activePlayerId)
  if (!bench?.teamAbbr || !active?.teamAbbr) return false
  if (!teamHasGameOnDate(bench.teamAbbr, date, input.schedule)) return false
  if (!teamHasGameOnDate(active.teamAbbr, date, input.schedule)) return false

  return benchCanEnterOnDate(
    suggestion,
    date,
    input.youEntries,
    input.daily,
    input.playersById,
    input.schedule,
  )
}

export const visibleSitStartSuggestions = (
  suggestions: SitStartSuggestion[],
  input: SitStartDisplayInput,
): SitStartSuggestion[] =>
  suggestions.filter((suggestion) =>
    input.days.some((day) => sitStartSwapAppliesOnDate(suggestion, day, input)),
  )

const shortName = (player: SeasonPlayer | undefined): string => {
  const name = player?.name?.trim()
  if (!name) return "?"
  const parts = name.split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1]! : name
}

export const sitStartBadgesByPlayerDay = (
  suggestions: SitStartSuggestion[],
  input: SitStartDisplayInput,
): Record<string, string> => {
  const badges: Record<string, string> = {}
  for (const suggestion of visibleSitStartSuggestions(suggestions, input)) {
    const benchName = shortName(
      resolveDisplayPlayer(input.playersById, suggestion.benchPlayerId),
    )
    const activeName = shortName(
      resolveDisplayPlayer(input.playersById, suggestion.activePlayerId),
    )
    for (const day of input.days) {
      if (!sitStartSwapAppliesOnDate(suggestion, day, input)) continue
      const benchKey = sitStartBadgeKey(day, suggestion.benchPlayerId)
      const activeKey = sitStartBadgeKey(day, suggestion.activePlayerId)
      if (!badges[benchKey]) badges[benchKey] = `Start over ${activeName}`
      if (!badges[activeKey]) badges[activeKey] = `Sit for ${benchName}`
    }
  }
  return badges
}
