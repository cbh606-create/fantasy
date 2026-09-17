import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import type { DailyLineups } from "./dailyLineups"
import { gameWeightForTeamDate } from "./games"
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
        if (gameWeightForTeamDate(kept.teamAbbr, date, schedule) === 0) continue
        seatStreamerIfOpen(next[date], playerId, date, playersById, schedule, {
          allowFlexSlots: true,
        })
      }
    }
    for (const cell of day.cells) {
      if (!cell.playerId || cell.action === "empty") continue
      if (omitSeats?.has(previewSeatKey(date, cell.playerId))) continue
      const player = resolvePlayer(playersById, cell.playerId)
      if (!player?.teamAbbr) continue
      if (gameWeightForTeamDate(player.teamAbbr, date, schedule) === 0) continue
      seatStreamerIfOpen(next[date], cell.playerId, date, playersById, schedule, {
        allowFlexSlots: true,
      })
    }
  }

  return next
}
