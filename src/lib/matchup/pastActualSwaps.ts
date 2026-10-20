import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type {
  StreamingPlanDayCell,
  StreamingPlanRosterDropKind,
} from "@/lib/matchup/types"

export type PastActualSwap = {
  date: string
  spotIndex: number
  addedPlayerId: string | null
  drop: string
}

const IR_PREFIX = "ir:"

export const pastActualStorageKey = (
  leagueId: string,
  matchupStart: string,
): string => `matchup-past-swaps:${leagueId}:${matchupStart}`

export const parsePastActualSwaps = (raw: string | null): PastActualSwap[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as PastActualSwap[]
  } catch {
    return []
  }
}

export const readPastActualSwaps = (
  leagueId: string,
  matchupStart: string,
  storage?: Pick<Storage, "getItem" | "setItem">,
): PastActualSwap[] => {
  const store = storage ?? localStorage
  return parsePastActualSwaps(
    store.getItem(pastActualStorageKey(leagueId, matchupStart)),
  )
}

export const writePastActualSwaps = (
  leagueId: string,
  matchupStart: string,
  swaps: readonly PastActualSwap[],
  storage?: Pick<Storage, "getItem" | "setItem">,
): void => {
  const store = storage ?? localStorage
  store.setItem(
    pastActualStorageKey(leagueId, matchupStart),
    JSON.stringify(swaps),
  )
}

export const upsertPastActualSwap = (
  swaps: readonly PastActualSwap[],
  swap: PastActualSwap,
): PastActualSwap[] => {
  const index = swaps.findIndex(
    (item) => item.date === swap.date && item.spotIndex === swap.spotIndex,
  )
  if (index < 0) return [...swaps, swap]
  return swaps.map((item, itemIndex) => (itemIndex === index ? swap : item))
}

export const clearPastActualSpot = (
  swaps: readonly PastActualSwap[],
  date: string,
  spotIndex: number,
): PastActualSwap[] =>
  swaps.filter((item) => item.date !== date || item.spotIndex !== spotIndex)

const rosterDropFrom = (
  drop: string,
): {
  droppedPlayerId: string | null
  rosterDropPlayerId: string | null
  rosterDropKind: StreamingPlanRosterDropKind
} => {
  if (drop.startsWith(IR_PREFIX)) {
    const parkedId = drop.slice(IR_PREFIX.length)
    return {
      droppedPlayerId: null,
      rosterDropPlayerId: parkedId.length > 0 ? parkedId : null,
      rosterDropKind: "ir",
    }
  }
  if (drop === "open_slot") {
    return {
      droppedPlayerId: null,
      rosterDropPlayerId: null,
      rosterDropKind: "open_slot",
    }
  }
  if (drop === "hold") {
    return {
      droppedPlayerId: null,
      rosterDropPlayerId: null,
      rosterDropKind: "none",
    }
  }
  return {
    droppedPlayerId: drop,
    rosterDropPlayerId: drop,
    rosterDropKind: "player",
  }
}

export const pastActualCell = (
  swap: PastActualSwap | undefined,
  spotIndex: number,
  nextAddIndex: number,
): StreamingPlanDayCell => {
  if (!swap) {
    return {
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

  const drop = rosterDropFrom(swap.drop)
  const added = Boolean(swap.addedPlayerId)
  const action = !added
    ? "empty"
    : drop.rosterDropKind === "player"
      ? "drop_add"
      : "add"

  return {
    spotIndex,
    playerId: swap.addedPlayerId,
    action,
    droppedPlayerId: drop.droppedPlayerId,
    rosterDropPlayerId: drop.rosterDropPlayerId,
    rosterDropKind: drop.rosterDropKind,
    addIndex: added ? nextAddIndex + 1 : null,
    alternativePlayerIds: [],
    targetCategoryIds: [],
  }
}

const copyDaily = (daily: DailyLineups): DailyLineups => {
  const next: DailyLineups = {}
  for (const [date, entries] of Object.entries(daily)) {
    next[date] = entries.map((entry) => ({ ...entry }))
  }
  return next
}

const parkOnIr = (
  entries: DailyLineups[string],
  parkedId: string,
): void => {
  const il = entries.find(
    (entry) =>
      entry.slot === "IL" &&
      (entry.playerId === null || entry.playerId === parkedId),
  )
  for (const entry of entries) {
    if (entry !== il && entry.playerId === parkedId) entry.playerId = null
  }
  if (il) il.playerId = parkedId
}

const clearPlayer = (entries: DailyLineups[string], playerId: string): void => {
  for (const entry of entries) {
    if (entry.playerId === playerId) entry.playerId = null
  }
}

const seatAdd = (entries: DailyLineups[string], playerId: string): void => {
  if (entries.some((entry) => entry.playerId === playerId)) return
  const seat = entries.find(
    (entry) =>
      entry.playerId === null && entry.slot !== "IL" && entry.slot !== "BE",
  )
  if (seat) seat.playerId = playerId
}

export const applyPastSwapToDaily = (
  daily: DailyLineups,
  swap: PastActualSwap,
  fromDate: string,
  days: readonly string[],
): DailyLineups => {
  const next = copyDaily(daily)
  const parkedId = swap.drop.startsWith(IR_PREFIX)
    ? swap.drop.slice(IR_PREFIX.length)
    : ""
  const isIrDrop = swap.drop.startsWith(IR_PREFIX)
  const removesPlayer =
    swap.drop !== "hold" && swap.drop !== "open_slot" && !isIrDrop

  for (const date of days) {
    if (date < fromDate) continue
    const entries = next[date]
    if (!entries) continue
    if (parkedId) parkOnIr(entries, parkedId)
    else if (removesPlayer) clearPlayer(entries, swap.drop)
    if (swap.addedPlayerId) seatAdd(entries, swap.addedPlayerId)
  }

  return next
}
