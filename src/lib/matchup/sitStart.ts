import { buildMatchupBoard } from "./board"
import { isActiveSlot, MAX_SIT_START } from "./constants"
import type { SitStartSuggestion, SitStartSwap } from "./types"
import { activeTeamWeeklyTotals } from "./weekly"
import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

type SuggestSitStartInput = {
  youEntries: SeasonRosterEntry[]
  oppEntries: SeasonRosterEntry[]
  players: SeasonPlayer[]
  gamesMap: Map<string, number>
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
): number => {
  const youTotals = activeTeamWeeklyTotals(youEntries, playerMap, gamesMap)
  const oppTotals = activeTeamWeeklyTotals(oppEntries, playerMap, gamesMap)
  return buildMatchupBoard(youTotals, oppTotals).projectedCatWins
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
}: SuggestSitStartInput): SitStartSuggestion[] => {
  const playerMap = playersById(players)
  const baseline = projectedCatWins(youEntries, oppEntries, playerMap, gamesMap)

  const benchPlayerIds = youEntries
    .filter((entry) => entry.slot === "BE" && entry.playerId)
    .map((entry) => entry.playerId as string)

  const activePlayerIds = youEntries
    .filter((entry) => isActiveSlot(entry.slot) && entry.playerId)
    .map((entry) => entry.playerId as string)

  const candidates: SitStartSuggestion[] = []

  for (const benchPlayerId of benchPlayerIds) {
    for (const activePlayerId of activePlayerIds) {
      const swapped = swapFilledEntries(youEntries, benchPlayerId, activePlayerId)
      if (!swapped) continue

      const nextProjected = projectedCatWins(swapped, oppEntries, playerMap, gamesMap)
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
): SeasonRosterEntry[] | { error: "stale_lineup" } => {
  const next = swapFilledEntries(entries, swap.benchPlayerId, swap.activePlayerId)
  if (!next) return { error: "stale_lineup" }
  return next
}
