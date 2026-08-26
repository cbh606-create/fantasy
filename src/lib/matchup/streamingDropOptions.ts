import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import {
  isAdpProtected,
  isLongTermInjuryException,
  isUnderperformingDropException,
} from "./streamingDropPolicy"
import { streamingAddDropKey } from "./streamingPlans"
import type { StreamingPlan } from "./types"

export const parseStreamingAddDropKey = (key: string) => {
  const colon = key.lastIndexOf(":")
  return {
    date: key.slice(0, colon),
    spotIndex: Number.parseInt(key.slice(colon + 1), 10),
  }
}

export const compareStreamingAddDropKeys = (left: string, right: string) => {
  const a = parseStreamingAddDropKey(left)
  const b = parseStreamingAddDropKey(right)
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  return a.spotIndex - b.spotIndex
}

export const isAfterStreamingAddDropKey = (left: string, right: string) =>
  compareStreamingAddDropKeys(left, right) > 0

const isIlSlot = (slot: SeasonRosterEntry["slot"]) => slot === "IL"

export const hasOpenNonIlRosterSlot = (entries: SeasonRosterEntry[]) =>
  entries.some((entry) => !isIlSlot(entry.slot) && entry.playerId === null)

const isProtectedRosterPlayer = (
  player: SeasonPlayer,
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
) => {
  const outDays = injuryOutDaysByPlayerId?.[player.id] ?? 0
  const adp = adpByPlayerId?.[player.id] ?? null
  return (
    isAdpProtected(adp) &&
    !isLongTermInjuryException(outDays) &&
    !isUnderperformingDropException(player)
  )
}

export const eligibleRosterDropPlayerIds = (
  entries: SeasonRosterEntry[],
  playersById: Record<string, SeasonPlayer>,
  earlierDroppedIds: string[],
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
): string[] => {
  const dropped = new Set(earlierDroppedIds)
  return entries
    .filter(
      (entry) =>
        !isIlSlot(entry.slot) && entry.playerId && !dropped.has(entry.playerId),
    )
    .map((entry) => playersById[entry.playerId!])
    .filter((player): player is SeasonPlayer => Boolean(player))
    .filter(
      (player) =>
        !isProtectedRosterPlayer(
          player,
          adpByPlayerId,
          injuryOutDaysByPlayerId,
        ),
    )
    .map((player) => player.id)
    .sort((left, right) =>
      (playersById[left]?.name ?? left).localeCompare(
        playersById[right]?.name ?? right,
      ),
    )
}

export const collectEarlierRosterDropIds = (
  plan: StreamingPlan,
  date: string,
  spotIndex: number,
): string[] => {
  const targetKey = streamingAddDropKey(date, spotIndex)
  const dropped: string[] = []

  for (const day of plan.days) {
    const cells = [...day.cells].sort(
      (left, right) => left.spotIndex - right.spotIndex,
    )
    for (const cell of cells) {
      const key = streamingAddDropKey(day.date, cell.spotIndex)
      if (key === targetKey) return dropped
      if (
        cell.action === "add" &&
        cell.rosterDropKind === "player" &&
        cell.rosterDropPlayerId
      ) {
        dropped.push(cell.rosterDropPlayerId)
      }
    }
  }

  return dropped
}

export const rosterDropSelectOptions = (input: {
  eligiblePlayerIds: string[]
  earlierDroppedIds: string[]
  allowOpenSlot: boolean
  playersById: Record<string, SeasonPlayer>
}): { value: string; label: string }[] => {
  const dropped = new Set(input.earlierDroppedIds)
  const options: { value: string; label: string }[] = []

  if (input.allowOpenSlot) {
    options.push({ value: "open_slot", label: "Open slot" })
  }

  for (const playerId of input.eligiblePlayerIds) {
    if (dropped.has(playerId)) continue
    options.push({
      value: playerId,
      label: input.playersById[playerId]?.name ?? playerId,
    })
  }

  return options
}

export const perspectiveRosterEntries = (state: SeasonLeagueState) =>
  state.teams[state.perspectiveTeamIndex]!.entries
