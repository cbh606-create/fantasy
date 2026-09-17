import { buildDayLineupFromRoster, type DailyLineups } from "@/lib/matchup/dailyLineups"
import { isActiveSlot } from "@/lib/matchup/constants"
import {
  eligibleForSlot,
  isSpecificPositionSlot,
} from "@/lib/matchup/eligibility"
import { gameWeightForTeamDate } from "@/lib/matchup/games"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

const MS_PER_DAY = 86400000

const parseUtcMidnight = (iso: string): number => {
  const [year, month, day] = iso.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

const playerPlaysOnDate = (
  player: SeasonPlayer,
  date: string,
  schedule: ScheduleResponse,
): boolean => {
  const teamAbbr = player.teamAbbr
  if (!teamAbbr) return false
  return gameWeightForTeamDate(teamAbbr, date, schedule) > 0
}

const holeStartDates = (
  player: SeasonPlayer,
  fromDate: string,
  days: string[],
  holeByDate: Record<string, SeasonRosterEntry[]>,
  schedule: ScheduleResponse,
): string[] => {
  const dates: string[] = []
  for (const day of days) {
    if (day < fromDate) continue
    if (!playerPlaysOnDate(player, day, schedule)) continue
    const lineup = holeByDate[day]
    if (!lineup || !playerHasEligibleHole(player, lineup)) continue
    dates.push(day)
  }
  return dates
}

export const buildHoleDayLineup = (args: {
  day: string
  teamEntries: SeasonRosterEntry[]
  players: SeasonPlayer[]
  schedule: ScheduleResponse
  cutPlayerIds?: ReadonlySet<string>
  savedDay?: SeasonRosterEntry[] | undefined
  rosterSlots?: SeasonSlot[]
}): SeasonRosterEntry[] => {
  const {
    day,
    teamEntries,
    players,
    schedule,
    cutPlayerIds,
    savedDay,
    rosterSlots,
  } = args

  if (savedDay) {
    return savedDay.map((entry) =>
      entry.playerId && cutPlayerIds?.has(entry.playerId)
        ? { ...entry, playerId: null }
        : { ...entry },
    )
  }

  const entriesForBuild = cutPlayerIds?.size
    ? teamEntries.map((entry) =>
        entry.playerId && cutPlayerIds.has(entry.playerId)
          ? { ...entry, playerId: null }
          : entry,
      )
    : teamEntries.map((entry) => ({ ...entry }))

  return buildDayLineupFromRoster(
    day,
    entriesForBuild,
    players,
    schedule,
    rosterSlots,
  )
}

export const countOpenActiveSlots = (entries: SeasonRosterEntry[]): number =>
  entries.filter(
    (entry) => isActiveSlot(entry.slot) && entry.playerId === null,
  ).length

export const playerHasEligibleHole = (
  player: SeasonPlayer,
  entries: SeasonRosterEntry[] | undefined,
): boolean => {
  if (!entries?.length) return false
  if (entries.some((entry) => entry.playerId === player.id)) return false
  const specificEmpty = entries.filter(
    (entry) =>
      entry.playerId === null && isSpecificPositionSlot(entry.slot),
  )
  if (specificEmpty.length > 0) {
    return specificEmpty.some((entry) => eligibleForSlot(player, entry.slot))
  }
  return entries.some(
    (entry) =>
      isActiveSlot(entry.slot) &&
      entry.playerId === null &&
      eligibleForSlot(player, entry.slot),
  )
}

export const remainingHoleStarts = (
  player: SeasonPlayer,
  fromDate: string,
  days: string[],
  holeByDate: Record<string, SeasonRosterEntry[]>,
  schedule: ScheduleResponse,
): number =>
  holeStartDates(player, fromDate, days, holeByDate, schedule).length

export const countHoleB2bPairs = (
  player: SeasonPlayer,
  fromDate: string,
  days: string[],
  holeByDate: Record<string, SeasonRosterEntry[]>,
  schedule: ScheduleResponse,
): number => {
  const startDates = holeStartDates(
    player,
    fromDate,
    days,
    holeByDate,
    schedule,
  )
  let pairs = 0
  for (let index = 1; index < startDates.length; index += 1) {
    const previous = parseUtcMidnight(startDates[index - 1]!)
    const current = parseUtcMidnight(startDates[index]!)
    if (current - previous === MS_PER_DAY) pairs += 1
  }
  return pairs
}

export const countTeamStarts = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): number => {
  const playersById = new Map(players.map((p) => [p.id, p]))
  let total = 0
  for (const [day, entries] of Object.entries(daily)) {
    for (const entry of entries) {
      if (!entry.playerId) continue
      const rostered = playersById.get(entry.playerId)
      if (!rostered) continue
      if (playerPlaysOnDate(rostered, day, schedule)) total += 1
    }
  }
  return total
}

export const pickAutoRosterCut = (args: {
  date: string
  days: string[]
  teamEntries: SeasonRosterEntry[]
  players: SeasonPlayer[]
  schedule: ScheduleResponse
  seatedTonight: SeasonRosterEntry[]
}): string | null => {
  const { date, days, teamEntries, players, schedule, seatedTonight } = args

  const seatedTonightIds = new Set(
    seatedTonight
      .filter((entry) => entry.playerId !== null)
      .map((entry) => entry.playerId as string),
  )

  const playersById = new Map(players.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const candidates: string[] = []

  for (const entry of teamEntries) {
    if (entry.slot === "IL" || !entry.playerId || seen.has(entry.playerId)) {
      continue
    }
    seen.add(entry.playerId)
    if (seatedTonightIds.has(entry.playerId)) continue
    if (!playersById.has(entry.playerId)) continue
    candidates.push(entry.playerId)
  }

  if (candidates.length === 0) return null

  const remainingGameDays = (playerId: string): number => {
    const rostered = playersById.get(playerId)
    if (!rostered?.teamAbbr) return 0
    let count = 0
    for (const day of days) {
      if (day < date) continue
      if (gameWeightForTeamDate(rostered.teamAbbr, day, schedule) > 0) {
        count += 1
      }
    }
    return count
  }

  candidates.sort((left, right) => {
    const gameDiff = remainingGameDays(left) - remainingGameDays(right)
    if (gameDiff !== 0) return gameDiff
    return left.localeCompare(right)
  })

  return candidates[0] ?? null
}
