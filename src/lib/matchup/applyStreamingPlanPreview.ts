import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import type { DailyLineups } from "./dailyLineups"
import { playerHasGameOnDate } from "./games"
import { seatStreamerIfOpen } from "./streamerMove"
import type { StreamingPlan } from "./types"

const resolvePlayer = (
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  playerId: string,
): SeasonPlayer | undefined =>
  playersById instanceof Map ? playersById.get(playerId) : playersById[playerId]

const cloneDaily = (daily: DailyLineups): DailyLineups =>
  Object.fromEntries(
    Object.entries(daily).map(([day, entries]) => [
      day,
      entries.map((entry) => ({ ...entry })),
    ]),
  )

const clearPlayerFromDay = (
  entries: SeasonRosterEntry[] | undefined,
  playerId: string,
): void => {
  if (!entries) return
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry?.playerId === playerId) {
      entries[index] = { ...entry, playerId: null }
    }
  }
}

/** ESPN roster ids are numeric. The projection pool uses `espn-` plus that id. */
export const playerIdAliases = (playerId: string): string[] => {
  if (playerId.startsWith("espn-")) {
    const numeric = playerId.slice(5)
    return numeric.length > 0 ? [playerId, numeric] : [playerId]
  }
  return [playerId, `espn-${playerId}`]
}

export const samePlayerId = (
  left: string | null | undefined,
  right: string,
): boolean => Boolean(left && playerIdAliases(left).includes(right))

type StreamDropCell = {
  spotIndex?: number
  playerId?: string | null
  action?: string
  droppedPlayerId?: string | null
  rosterDropPlayerId?: string | null
  rosterDropKind?: string
}

type StreamDropDay = {
  date: string
  cells?: readonly StreamDropCell[]
}

const markStreamDrop = (
  droppedFrom: Map<string, string>,
  playerId: string,
  date: string,
) => {
  for (const alias of playerIdAliases(playerId)) {
    const previous = droppedFrom.get(alias)
    if (!previous || date < previous) droppedFrom.set(alias, date)
  }
}

const isSpotAdd = (
  cell: StreamDropCell,
): cell is StreamDropCell & { playerId: string } =>
  Boolean(cell.playerId && (cell.action === "add" || cell.action === "drop_add"))

/**
 * Dropped players, including espn-/numeric aliases, leave from the drop date on.
 * A later add on the same spot also drops a roster id that is only an alias of
 * the previous streamer. A streamer who is not that roster alias stays.
 */
export const clearStreamDropsFromDaily = (
  daily: DailyLineups,
  days: readonly StreamDropDay[],
): DailyLineups => {
  const seatedIds = new Set<string>()
  for (const entries of Object.values(daily)) {
    for (const entry of entries) {
      if (entry.playerId) seatedIds.add(entry.playerId)
    }
  }
  const droppedFrom = new Map<string, string>()
  for (const day of days) {
    for (const cell of day.cells ?? []) {
      const ids: string[] = []
      if (cell.droppedPlayerId) ids.push(cell.droppedPlayerId)
      if (cell.rosterDropKind === "player" && cell.rosterDropPlayerId) {
        ids.push(cell.rosterDropPlayerId)
      }
      for (const id of ids) markStreamDrop(droppedFrom, id, day.date)
    }
  }

  const sortedDays = [...days].sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  )
  const spotIndexes = new Set<number>()
  for (const day of sortedDays) {
    for (const cell of day.cells ?? []) {
      if (typeof cell.spotIndex === "number") spotIndexes.add(cell.spotIndex)
    }
  }
  for (const spotIndex of spotIndexes) {
    let current: string | null = null
    for (const day of sortedDays) {
      const cell = (day.cells ?? []).find((item) => item.spotIndex === spotIndex)
      if (!cell || !isSpotAdd(cell)) continue
      const added = cell.playerId
      if (current && !samePlayerId(current, added)) {
        const rosterAlias = playerIdAliases(current).some(
          (alias) => alias !== current && seatedIds.has(alias),
        )
        if (rosterAlias) {
          for (const alias of playerIdAliases(current)) {
            markStreamDrop(droppedFrom, alias, day.date)
          }
        }
      }
      current = added
    }
  }

  if (droppedFrom.size === 0) return daily
  const next = cloneDaily(daily)
  for (const [playerId, fromDate] of droppedFrom) {
    for (const date of Object.keys(next)) {
      if (date < fromDate) continue
      clearPlayerFromDay(next[date], playerId)
    }
  }
  return next
}

export type ApplyStreamingPlanPreviewOptions = {
  /** `${date}:${playerId}` — skip seating these streamers (user sat them in preview). */
  omitSeats?: ReadonlySet<string>
  /** `${date}:${playerId}` — do not auto-start these roster players. */
  omitRosterSeats?: ReadonlySet<string>
  /** `${date}:${playerId}` — reseat a sat roster player; ignored for plan roster cuts. */
  keepRosterSeats?: ReadonlySet<string>
  /** Non-IL roster ids to reseat even when they are missing from `baseDaily`. */
  rosterPlayerIds?: readonly string[]
}

export const previewSeatKey = (date: string, playerId: string) =>
  `${date}:${playerId}`

/** FA adds on the opponent streaming plan — must survive pruneDailyToRoster. */
export const previewOpponentStreamerIds = (
  plan: StreamingPlan | null,
): Set<string> => {
  const ids = new Set<string>()
  if (!plan) return ids
  for (const day of plan.opponentDays ?? []) {
    if (day.streamerPlayerId) ids.add(day.streamerPlayerId)
    for (const cell of day.cells ?? []) {
      if (cell.playerId) ids.add(cell.playerId)
    }
  }
  return ids
}

/** Days a streamer stays on the roster: from the add through the day before a drop. */
export const streamerActiveDatesByPlayerId = (
  plan: StreamingPlan | null,
): Record<string, Set<string>> => {
  const byId: Record<string, Set<string>> = {}
  if (!plan) return byId

  const playerIds = new Set<string>()
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.playerId && cell.action !== "empty") playerIds.add(cell.playerId)
      if (cell.droppedPlayerId) playerIds.add(cell.droppedPlayerId)
    }
  }

  const days = [...plan.days].sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  )

  for (const playerId of playerIds) {
    let active = false
    const dates = new Set<string>()
    for (const day of days) {
      const droppedToday = day.cells.some(
        (cell) =>
          samePlayerId(cell.droppedPlayerId, playerId) ||
          (cell.rosterDropKind === "player" &&
            samePlayerId(cell.rosterDropPlayerId, playerId)),
      )
      const listedToday = day.cells.some(
        (cell) =>
          samePlayerId(cell.playerId, playerId) && cell.action !== "empty",
      )
      if (droppedToday && !listedToday) active = false
      else if (listedToday) active = true
      if (active) dates.add(day.date)
    }
    if (dates.size > 0) byId[playerId] = dates
  }

  return byId
}

export const applyStreamingPlanPreview = (
  baseDaily: DailyLineups,
  plan: StreamingPlan,
  playersById: Map<string, SeasonPlayer> | Record<string, SeasonPlayer>,
  schedule: ScheduleResponse,
  options: ApplyStreamingPlanPreviewOptions = {},
): DailyLineups => {
  const next = cloneDaily(baseDaily)
  const matchupDays = Object.keys(next).sort()
  const omitSeats = options.omitSeats
  const omitRosterSeats = options.omitRosterSeats
  const keepRosterSeats = options.keepRosterSeats

  const rosterDropFromById: Record<string, string> = {}
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.rosterDropKind === "player" && cell.rosterDropPlayerId) {
        const previous = rosterDropFromById[cell.rosterDropPlayerId]
        if (!previous || day.date < previous) {
          rosterDropFromById[cell.rosterDropPlayerId] = day.date
        }
      }
    }
  }

  const irParkFromById: Record<string, string> = {}
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.rosterDropKind !== "ir" || !cell.rosterDropPlayerId) continue
      const previous = irParkFromById[cell.rosterDropPlayerId]
      if (!previous || day.date < previous) {
        irParkFromById[cell.rosterDropPlayerId] = day.date
      }
    }
  }
  /** `${date}:${index}` — active seats an IR park vacated on a later date. */
  const blockedActiveIndexes = new Set<string>()

  const planStreamerIds = new Set(
    plan.days.flatMap((planDay) =>
      planDay.cells
        .map((cell) => cell.playerId)
        .filter((playerId): playerId is string => Boolean(playerId)),
    ),
  )
  const droppedStreamerIds = new Set(
    plan.days.flatMap((planDay) =>
      planDay.cells
        .map((cell) => cell.droppedPlayerId)
        .filter((playerId): playerId is string => Boolean(playerId)),
    ),
  )
  const baseRosterIds = new Set<string>(options.rosterPlayerIds ?? [])
  if (options.rosterPlayerIds == null) {
    for (const entries of Object.values(baseDaily)) {
      for (const entry of entries) {
        if (entry.playerId) baseRosterIds.add(entry.playerId)
      }
    }
  } else {
    for (const date of matchupDays) {
      const entries = next[date]
      if (!entries) continue
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        const playerId = entry?.playerId
        if (!playerId) continue
        if (baseRosterIds.has(playerId) || planStreamerIds.has(playerId)) continue
        entries[index] = { ...entry, playerId: null }
      }
    }
  }

  const seatOnDate = (date: string, playerId: string) => {
    const parkedFrom = irParkFromById[playerId]
    if (parkedFrom && date >= parkedFrom) return
    const entries = next[date]
    if (!entries) return
    const openIndexes = entries
      .map((_, index) => index)
      .filter((index) => !blockedActiveIndexes.has(`${date}:${index}`))
    const seatable = openIndexes.map((index) => entries[index]!)
    seatStreamerIfOpen(seatable, playerId, date, playersById, schedule, {
      allowFlexSlots: true,
    })
    openIndexes.forEach((entryIndex, seatableIndex) => {
      entries[entryIndex] = seatable[seatableIndex]!
    })
  }

  const seatPlayingRosterOnDate = (date: string) => {
    if (keepRosterSeats) {
      const keepPrefix = `${date}:`
      for (const key of keepRosterSeats) {
        if (!key.startsWith(keepPrefix)) continue
        const playerId = key.slice(keepPrefix.length)
        if (!playerId) continue
        const droppedFrom = rosterDropFromById[playerId]
        if (droppedFrom && date >= droppedFrom) continue
        if (omitRosterSeats?.has(previewSeatKey(date, playerId))) continue
        if (next[date]?.some((entry) => entry.playerId === playerId)) continue
        const kept = resolvePlayer(playersById, playerId)
        if (!kept?.teamAbbr) continue
        if (!playerHasGameOnDate(kept, date, schedule)) continue
        seatOnDate(date, playerId)
      }
    }
    for (const playerId of baseRosterIds) {
      if (omitRosterSeats?.has(previewSeatKey(date, playerId))) continue
      if (planStreamerIds.has(playerId) || droppedStreamerIds.has(playerId)) {
        continue
      }
      const droppedFrom = rosterDropFromById[playerId]
      if (droppedFrom && date >= droppedFrom) continue
      if (next[date]?.some((entry) => entry.playerId === playerId)) continue
      const rostered = resolvePlayer(playersById, playerId)
      if (!rostered?.teamAbbr) continue
      if (!playerHasGameOnDate(rostered, date, schedule)) continue
      seatOnDate(date, playerId)
    }
  }

  for (const day of plan.days) {
    const date = day.date
    for (const cell of day.cells) {
      if (cell.rosterDropKind === "player" && cell.rosterDropPlayerId) {
        for (const laterDay of matchupDays.filter((dayKey) => dayKey >= date)) {
          clearPlayerFromDay(next[laterDay], cell.rosterDropPlayerId)
        }
      }
      if (cell.action === "drop_add" && cell.droppedPlayerId) {
        for (const laterDay of matchupDays.filter((dayKey) => dayKey >= date)) {
          clearPlayerFromDay(next[laterDay], cell.droppedPlayerId)
        }
      }
    }
  }

  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (cell.rosterDropKind !== "ir" || !cell.rosterDropPlayerId) continue
      const parkedId = cell.rosterDropPlayerId
      for (const date of matchupDays) {
        if (date < day.date) continue
        const entries = next[date] ?? []
        const parkedIlIndex = entries.findIndex(
          (entry) => entry.slot === "IL" && entry.playerId === parkedId,
        )
        const ilIndex =
          parkedIlIndex >= 0
            ? parkedIlIndex
            : entries.findIndex(
                (entry) => entry.slot === "IL" && entry.playerId == null,
              )
        if (ilIndex < 0) continue
        const vacatedIndex = entries.findIndex(
          (entry) => entry.slot !== "IL" && entry.playerId === parkedId,
        )
        next[date] = entries.map((entry, index) => {
          if (index === ilIndex) return { ...entry, playerId: parkedId }
          if (index === vacatedIndex) return { ...entry, playerId: null }
          return entry
        })
        if (date > day.date && vacatedIndex >= 0) {
          blockedActiveIndexes.add(`${date}:${vacatedIndex}`)
        }
      }
    }
  }

  for (const date of matchupDays) {
    for (const key of omitRosterSeats ?? []) {
      const prefix = `${date}:`
      if (!key.startsWith(prefix)) continue
      const playerId = key.slice(prefix.length)
      if (playerId) clearPlayerFromDay(next[date], playerId)
    }
    seatPlayingRosterOnDate(date)
  }

  for (const day of plan.days) {
    const date = day.date
    for (const cell of day.cells) {
      if (!cell.playerId || cell.action === "empty") continue
      if (omitSeats?.has(previewSeatKey(date, cell.playerId))) continue
      const player = resolvePlayer(playersById, cell.playerId)
      if (!player?.teamAbbr) continue
      if (!playerHasGameOnDate(player, date, schedule)) continue
      seatOnDate(date, cell.playerId)
    }
  }

  const activeDates = streamerActiveDatesByPlayerId(plan)
  for (const date of matchupDays) {
    for (const [playerId, dates] of Object.entries(activeDates)) {
      if (!dates.has(date)) continue
      if (omitSeats?.has(previewSeatKey(date, playerId))) continue
      const player = resolvePlayer(playersById, playerId)
      if (!player?.teamAbbr) continue
      if (!playerHasGameOnDate(player, date, schedule)) continue
      seatOnDate(date, playerId)
    }
  }

  for (const date of matchupDays) {
    for (const key of omitRosterSeats ?? []) {
      const prefix = `${date}:`
      if (!key.startsWith(prefix)) continue
      const playerId = key.slice(prefix.length)
      if (playerId) clearPlayerFromDay(next[date], playerId)
    }
    for (const key of omitSeats ?? []) {
      const prefix = `${date}:`
      if (!key.startsWith(prefix)) continue
      const playerId = key.slice(prefix.length)
      if (playerId) clearPlayerFromDay(next[date], playerId)
    }
  }

  return clearStreamDropsFromDaily(next, plan.days)
}
