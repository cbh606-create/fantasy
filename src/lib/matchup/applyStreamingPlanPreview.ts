import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import type { DailyLineups } from "./dailyLineups"
import { teamHasGameOnDate } from "./games"
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

export type ApplyStreamingPlanPreviewOptions = {
  /** `${date}:${playerId}` — skip seating these streamers (user sat them in preview). */
  omitSeats?: ReadonlySet<string>
  /** `${date}:${playerId}` — reseat a sat roster player; ignored for plan roster cuts. */
  keepRosterSeats?: ReadonlySet<string>
  /** Non-IL roster ids to reseat even when they are missing from `baseDaily`. */
  rosterPlayerIds?: readonly string[]
}

export const previewSeatKey = (date: string, playerId: string) =>
  `${date}:${playerId}`

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
  const keepRosterSeats = options.keepRosterSeats

  const rosterDropFromById: Record<string, string> = {}
  for (const day of plan.days) {
    for (const cell of day.cells) {
      if (
        cell.action === "add" &&
        cell.rosterDropKind === "player" &&
        cell.rosterDropPlayerId
      ) {
        const previous = rosterDropFromById[cell.rosterDropPlayerId]
        if (!previous || day.date < previous) {
          rosterDropFromById[cell.rosterDropPlayerId] = day.date
        }
      }
    }
  }

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
  for (const entries of Object.values(baseDaily)) {
    for (const entry of entries) {
      if (entry.playerId) baseRosterIds.add(entry.playerId)
    }
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
        if (next[date]?.some((entry) => entry.playerId === playerId)) continue
        const kept = resolvePlayer(playersById, playerId)
        if (!kept?.teamAbbr) continue
        if (!teamHasGameOnDate(kept.teamAbbr, date, schedule)) continue
        seatStreamerIfOpen(next[date], playerId, date, playersById, schedule, {
          allowFlexSlots: true,
        })
      }
    }
    for (const playerId of baseRosterIds) {
      if (planStreamerIds.has(playerId) || droppedStreamerIds.has(playerId)) {
        continue
      }
      const droppedFrom = rosterDropFromById[playerId]
      if (droppedFrom && date >= droppedFrom) continue
      if (next[date]?.some((entry) => entry.playerId === playerId)) continue
      const rostered = resolvePlayer(playersById, playerId)
      if (!rostered?.teamAbbr) continue
      if (!teamHasGameOnDate(rostered.teamAbbr, date, schedule)) continue
      seatStreamerIfOpen(next[date], playerId, date, playersById, schedule, {
        allowFlexSlots: true,
      })
    }
  }

  for (const day of plan.days) {
    const date = day.date
    for (const cell of day.cells) {
      if (
        cell.action === "add" &&
        cell.rosterDropKind === "player" &&
        cell.rosterDropPlayerId
      ) {
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

  for (const date of matchupDays) {
    seatPlayingRosterOnDate(date)
  }

  for (const day of plan.days) {
    const date = day.date
    for (const cell of day.cells) {
      if (!cell.playerId || cell.action === "empty") continue
      if (omitSeats?.has(previewSeatKey(date, cell.playerId))) continue
      const player = resolvePlayer(playersById, cell.playerId)
      if (!player?.teamAbbr) continue
      if (!teamHasGameOnDate(player.teamAbbr, date, schedule)) continue
      seatStreamerIfOpen(next[date], cell.playerId, date, playersById, schedule, {
        allowFlexSlots: true,
      })
    }
  }

  return next
}
