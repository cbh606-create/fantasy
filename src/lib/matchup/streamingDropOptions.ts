import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"
import type { StreamingAddLock } from "./streamingAddOverride"
import { isAdpProtected } from "./streamingDropPolicy"
import { streamingAddDropKey } from "./streamingPlans"
import type { StreamingPlan, StreamingPlanDayCell } from "./types"

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

/** Keep a fixed menu, including its scrollbar, inside the viewport. */
export const clampFixedMenuBox = (
  anchor: { left: number; top: number; bottom: number },
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
): { top: number; left: number } => {
  const left = Math.max(
    margin,
    Math.min(anchor.left, viewportWidth - width - margin),
  )
  let top = anchor.bottom + 4
  if (top + height > viewportHeight - margin) {
    top = Math.max(margin, anchor.top - height - 4)
  }
  return { top, left }
}

/** Drop shown for a plan cell. IR parks use the `ir:` select value. */
export const plannedRosterDropValue = (
  cell: StreamingPlanDayCell | undefined,
): string => {
  if (cell?.rosterDropKind === "ir" && cell.rosterDropPlayerId) {
    return `ir:${cell.rosterDropPlayerId}`
  }
  if (cell?.rosterDropKind === "player" && cell.rosterDropPlayerId) {
    return cell.rosterDropPlayerId
  }
  if (cell?.rosterDropKind === "open_slot") return "open_slot"
  if (cell?.action === "drop_add" && cell.droppedPlayerId) {
    return cell.droppedPlayerId
  }
  return "hold"
}

const spotIndexesInMoves = (
  drops: Record<string, string>,
  locks: readonly StreamingAddLock[],
) => {
  const spots = new Set<number>()
  for (const key of Object.keys(drops)) {
    spots.add(parseStreamingAddDropKey(key).spotIndex)
  }
  for (const lock of locks) spots.add(lock.spotIndex)
  return spots
}

/**
 * Keep spots the user already edited. A later edit on another spot must not
 * wipe those moves. Days the user did not pin are copied from the current plan.
 */
export const retainOtherSpotMoves = (input: {
  plan: StreamingPlan | null
  editedSpotIndex: number
  drops: Record<string, string>
  locks: readonly StreamingAddLock[]
}): { drops: Record<string, string>; locks: StreamingAddLock[] } => {
  const drops = { ...input.drops }
  const locks = [...input.locks]
  if (!input.plan) return { drops, locks }

  const touched = spotIndexesInMoves(drops, locks)
  touched.delete(input.editedSpotIndex)

  for (const spotIndex of touched) {
    for (const day of input.plan.days) {
      const cell = day.cells.find((item) => item.spotIndex === spotIndex)
      const key = streamingAddDropKey(day.date, spotIndex)
      const drop = plannedRosterDropValue(cell)
      if (drop !== "hold" && drops[key] == null) drops[key] = drop
      if (
        !cell?.playerId ||
        (cell.action !== "add" && cell.action !== "drop_add")
      ) {
        continue
      }
      const alreadyLocked = locks.some(
        (lock) => lock.date === day.date && lock.spotIndex === spotIndex,
      )
      if (alreadyLocked) continue
      let holdUntil = day.date
      for (const later of input.plan.days) {
        if (later.date <= day.date) continue
        const laterCell = later.cells.find((item) => item.spotIndex === spotIndex)
        if (laterCell?.playerId !== cell.playerId) break
        holdUntil = later.date
      }
      locks.push({
        date: day.date,
        spotIndex,
        playerId: cell.playerId,
        holdUntil,
      })
    }
  }

  return { drops, locks }
}

/** Editing one day clears later drops on that spot only. */
export const clearLaterDropsOnSameSpot = (
  drops: Record<string, string>,
  editedKey: string,
): Record<string, string> => {
  const editedSpotIndex = parseStreamingAddDropKey(editedKey).spotIndex
  const next = { ...drops }
  for (const key of Object.keys(next)) {
    if (parseStreamingAddDropKey(key).spotIndex !== editedSpotIndex) continue
    if (isAfterStreamingAddDropKey(key, editedKey)) delete next[key]
  }
  return next
}

const isIlSlot = (slot: SeasonRosterEntry["slot"]) => slot === "IL"

export const hasOpenNonIlRosterSlot = (entries: SeasonRosterEntry[]) =>
  entries.some((entry) => !isIlSlot(entry.slot) && entry.playerId === null)

export const eligibleRosterDropPlayerIds = (
  entries: SeasonRosterEntry[],
  playersById: Record<string, SeasonPlayer>,
  earlierDroppedIds: string[],
  adpByPlayerId?: Record<string, number>,
  injuryOutDaysByPlayerId?: Record<string, number>,
  options?: {
    includeProtected?: boolean
    seatedTonightIds?: ReadonlySet<string>
  },
): string[] => {
  void injuryOutDaysByPlayerId
  const dropped = new Set(earlierDroppedIds)
  return entries
    .filter(
      (entry) =>
        !isIlSlot(entry.slot) &&
        entry.playerId &&
        !dropped.has(entry.playerId) &&
        !options?.seatedTonightIds?.has(entry.playerId),
    )
    .map((entry) => playersById[entry.playerId!])
    .filter((player): player is SeasonPlayer => Boolean(player))
    .filter(
      (player) =>
        options?.includeProtected ||
        !isAdpProtected(adpByPlayerId?.[player.id]),
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

/** Players already parked on IR by an earlier cell in the plan. */
export const collectEarlierIrParkIds = (
  plan: StreamingPlan,
  date: string,
  spotIndex: number,
): string[] => {
  const targetKey = streamingAddDropKey(date, spotIndex)
  const parked: string[] = []

  for (const day of plan.days) {
    const cells = [...day.cells].sort(
      (left, right) => left.spotIndex - right.spotIndex,
    )
    for (const cell of cells) {
      const key = streamingAddDropKey(day.date, cell.spotIndex)
      if (key === targetKey) return parked
      if (cell.rosterDropKind === "ir" && cell.rosterDropPlayerId) {
        parked.push(cell.rosterDropPlayerId)
      }
    }
  }

  return parked
}

/**
 * Streamers still held on the plan before this add/drop cell.
 * Dropdown can cut these even though they are not on the season roster snapshot.
 */
export const collectEarlierAddedStreamerIds = (
  plan: StreamingPlan,
  date: string,
  spotIndex: number,
): string[] => {
  const targetKey = streamingAddDropKey(date, spotIndex)
  const held = new Set<string>()

  for (const day of plan.days) {
    const cells = [...day.cells].sort(
      (left, right) => left.spotIndex - right.spotIndex,
    )
    for (const cell of cells) {
      const key = streamingAddDropKey(day.date, cell.spotIndex)
      if (key === targetKey) return [...held]

      if (cell.action === "drop_add" && cell.droppedPlayerId) {
        held.delete(cell.droppedPlayerId)
      }
      if (
        (cell.action === "add" ||
          cell.action === "drop_add" ||
          cell.action === "hold") &&
        cell.playerId
      ) {
        held.add(cell.playerId)
      }
      if (cell.action === "empty" && cell.playerId == null) {
        // Spot cleared; nothing to add. Occupant tracking is per-cell walk.
      }
      if (cell.rosterDropKind === "player" && cell.rosterDropPlayerId) {
        held.delete(cell.rosterDropPlayerId)
      }
    }
  }

  return [...held]
}

/**
 * Full dropdown list: every non-IL roster player plus earlier stream adds.
 * Suggested-drop ranking still uses eligibleRosterDropPlayerIds separately.
 */
export const rosterDropSelectPlayerIds = (
  entries: SeasonRosterEntry[],
  playersById: Record<string, SeasonPlayer>,
  earlierDroppedIds: string[],
  earlierAddedStreamerIds: readonly string[] = [],
): string[] => {
  const dropped = new Set(earlierDroppedIds)
  const ids = new Set<string>()

  for (const entry of entries) {
    if (isIlSlot(entry.slot) || !entry.playerId) continue
    if (dropped.has(entry.playerId)) continue
    if (!playersById[entry.playerId]) continue
    ids.add(entry.playerId)
  }

  for (const playerId of earlierAddedStreamerIds) {
    if (dropped.has(playerId)) continue
    if (!playersById[playerId]) continue
    ids.add(playerId)
  }

  return [...ids].sort((left, right) =>
    (playersById[left]?.name ?? left).localeCompare(
      playersById[right]?.name ?? right,
    ),
  )
}

export const rosterDropSelectOptions = (input: {
  eligiblePlayerIds: string[]
  earlierDroppedIds: string[]
  allowOpenSlot: boolean
  includeHold?: boolean
  playersById: Record<string, SeasonPlayer>
}): { value: string; label: string }[] => {
  const dropped = new Set(input.earlierDroppedIds)
  const options: { value: string; label: string }[] = []

  if (input.includeHold) {
    options.push({ value: "hold", label: "Hold" })
  }

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

export const irParkDropValue = (playerId: string): string => `ir:${playerId}`

export const parkedPlayerIdFromDropValue = (value: string): string | null =>
  value.startsWith("ir:") && value.length > 3 ? value.slice(3) : null

export const irParkDropOptions = (input: {
  entries: SeasonRosterEntry[]
  playersById: Record<string, SeasonPlayer>
  date: string
  schedule: ScheduleResponse
}): { value: string; label: string }[] => {
  const irOccupied = input.entries.some(
    (entry) => entry.slot === "IL" && entry.playerId != null,
  )
  if (irOccupied) return []

  const options: { value: string; label: string }[] = []
  const seen = new Set<string>()
  for (const entry of input.entries) {
    if (isIlSlot(entry.slot) || !entry.playerId || seen.has(entry.playerId)) {
      continue
    }
    const player = input.playersById[entry.playerId]
    if (!player) continue
    seen.add(entry.playerId)
    const note = player.injuryStatus === "out" ? "" : " (after OUT)"
    options.push({
      value: irParkDropValue(entry.playerId),
      label: `To IR · ${player.name}${note}`,
    })
  }
  return options.sort((left, right) => left.label.localeCompare(right.label))
}

export const resolveStoredIrParkValue = (
  value: string,
  options: readonly { value: string }[],
): string => {
  if (!parkedPlayerIdFromDropValue(value)) return value
  return options.some((option) => option.value === value) ? value : "hold"
}
