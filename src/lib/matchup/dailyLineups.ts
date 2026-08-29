import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import { isActiveSlot } from "./constants"
import { activeSlotsFor, eligibleForSlot } from "./eligibility"
import { gameWeightForTeamDate } from "./games"
import { weeklyPlayerStats } from "./weekly"

export type DailyLineups = Record<string, SeasonRosterEntry[]>

const COUNTING_CATEGORIES = ALL_CATEGORY_IDS.filter(
  (categoryId) => categoryId !== "FG_PCT" && categoryId !== "FT_PCT",
)

const emptyTotals = (): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as Record<CategoryId, number>

export const dailyStorageKey = (leagueId: string) => `matchup-days:${leagueId}`

export const extractActiveEntries = (
  entries: SeasonRosterEntry[],
  rosterSlots: SeasonSlot[] = SEASON_ROSTER_SLOTS,
): SeasonRosterEntry[] => {
  const queues = new Map<SeasonSlot, Array<string | null>>()
  for (const entry of entries) {
    if (!isActiveSlot(entry.slot)) continue
    const queue = queues.get(entry.slot) ?? []
    queue.push(entry.playerId)
    queues.set(entry.slot, queue)
  }

  return activeSlotsFor(rosterSlots).map((slot) => ({
    slot,
    playerId: queues.get(slot)?.shift() ?? null,
  }))
}

const rosteredPlayerIds = (teamEntries: SeasonRosterEntry[]): string[] => {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const entry of teamEntries) {
    if (entry.slot === "IL" || !entry.playerId || seen.has(entry.playerId)) {
      continue
    }
    seen.add(entry.playerId)
    ids.push(entry.playerId)
  }

  return ids
}

const eligibleActiveSlotCount = (
  player: SeasonPlayer,
  activeSlots: SeasonSlot[],
): number =>
  activeSlots.filter((slot) => eligibleForSlot(player, slot)).length

/** Pack roster players who have a game into as many active slots as eligibility allows. */
export const buildDayLineupFromRoster = (
  day: string,
  teamEntries: SeasonRosterEntry[],
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
  rosterSlots: SeasonSlot[] = SEASON_ROSTER_SLOTS,
): SeasonRosterEntry[] => {
  const activeSlots = activeSlotsFor(rosterSlots)
  const playersById = new Map(players.map((player) => [player.id, player]))
  const available = rosteredPlayerIds(teamEntries)
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is SeasonPlayer => {
      if (!player?.teamAbbr) return false
      return gameWeightForTeamDate(player.teamAbbr, day, schedule) > 0
    })
    .sort(
      (left, right) =>
        eligibleActiveSlotCount(left, activeSlots) -
        eligibleActiveSlotCount(right, activeSlots),
    )

  const nextEntries: SeasonRosterEntry[] = activeSlots.map((slot) => ({
    slot,
    playerId: null,
  }))
  const started = new Set<string>()

  for (const player of available) {
    if (started.has(player.id)) continue

    const exactIndex = nextEntries.findIndex((entry) => {
      if (entry.playerId !== null || !eligibleForSlot(player, entry.slot)) {
        return false
      }
      if (
        entry.slot === "UTIL" ||
        entry.slot === "G" ||
        entry.slot === "F"
      ) {
        return false
      }
      return Boolean(
        player.positions?.some((position) => position === entry.slot),
      )
    })
    const openIndex =
      exactIndex >= 0
        ? exactIndex
        : nextEntries.findIndex(
            (entry) =>
              entry.playerId === null && eligibleForSlot(player, entry.slot),
          )
    if (openIndex < 0) continue

    nextEntries[openIndex] = {
      ...nextEntries[openIndex],
      playerId: player.id,
    }
    started.add(player.id)
  }

  return nextEntries
}

export const initDailyLineups = (
  days: string[],
  teamEntries: SeasonRosterEntry[],
  rosterSlots: SeasonSlot[] = SEASON_ROSTER_SLOTS,
  players: SeasonPlayer[] = [],
  schedule?: ScheduleResponse,
): DailyLineups => {
  if (!schedule || players.length === 0) {
    const template = extractActiveEntries(teamEntries, rosterSlots)
    return Object.fromEntries(
      days.map((day) => [day, template.map((entry) => ({ ...entry }))]),
    )
  }

  return Object.fromEntries(
    days.map((day) => [
      day,
      buildDayLineupFromRoster(
        day,
        teamEntries,
        players,
        schedule,
        rosterSlots,
      ),
    ]),
  )
}

export const autofillOpenSlotsFromRoster = (
  daily: DailyLineups,
  schedule: ScheduleResponse,
  players: SeasonPlayer[],
  teamEntries: SeasonRosterEntry[],
  rosterSlots: SeasonSlot[] = SEASON_ROSTER_SLOTS,
): DailyLineups => {
  let changed = false
  const next = Object.fromEntries(
    Object.entries(daily).map(([day]) => {
      const rebuilt = buildDayLineupFromRoster(
        day,
        teamEntries,
        players,
        schedule,
        rosterSlots,
      )
      const previous = daily[day]
      if (
        !previous ||
        previous.length !== rebuilt.length ||
        previous.some(
          (entry, index) =>
            entry.playerId !== rebuilt[index]?.playerId ||
            entry.slot !== rebuilt[index]?.slot,
        )
      ) {
        changed = true
      }
      return [day, rebuilt]
    }),
  )

  return changed ? next : daily
}

export const clearNoGameActiveSlots = (
  daily: DailyLineups,
  schedule: ScheduleResponse,
  players: SeasonPlayer[],
  teamEntries: SeasonRosterEntry[] = [],
  rosterSlots: SeasonSlot[] = SEASON_ROSTER_SLOTS,
): DailyLineups => {
  if (teamEntries.length === 0) {
    const playersById = new Map(players.map((player) => [player.id, player]))
    let changed = false
    const cleared = Object.fromEntries(
      Object.entries(daily).map(([day, entries]) => [
        day,
        entries.map((entry) => {
          if (!entry.playerId) return entry
          const player = playersById.get(entry.playerId)
          const teamAbbr = player?.teamAbbr
          if (
            !teamAbbr ||
            gameWeightForTeamDate(teamAbbr, day, schedule) === 0
          ) {
            changed = true
            return { ...entry, playerId: null }
          }
          return entry
        }),
      ]),
    )
    return changed ? cleared : daily
  }

  return autofillOpenSlotsFromRoster(
    daily,
    schedule,
    players,
    teamEntries,
    rosterSlots,
  )
}

export const readDailyLineups = (leagueId: string): DailyLineups | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(dailyStorageKey(leagueId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as DailyLineups
    if (!parsed || typeof parsed !== "object") return null

    return parsed
  } catch {
    return null
  }
}

export const writeDailyLineups = (
  leagueId: string,
  daily: DailyLineups,
): void => {
  if (typeof window === "undefined") return

  window.localStorage.setItem(dailyStorageKey(leagueId), JSON.stringify(daily))
}

export const dailyLineupsMatchDays = (
  daily: DailyLineups,
  days: string[],
  rosterSlots: SeasonSlot[] = SEASON_ROSTER_SLOTS,
): boolean => {
  if (days.length === 0) return false

  const activeSlotCount = activeSlotsFor(rosterSlots).length
  return (
    days.every((day) => Array.isArray(daily[day]) && daily[day].length === activeSlotCount) &&
    Object.keys(daily).length === days.length
  )
}

export const playerGameDays = (
  player: SeasonPlayer,
  schedule: ScheduleResponse,
): Set<string> => {
  const days = new Set<string>()
  const teamAbbr = player.teamAbbr?.toUpperCase()
  if (!teamAbbr) return days

  for (const game of schedule.games) {
    if (!schedule.matchup.days.includes(game.date)) continue

    if (
      game.homeAbbr.toUpperCase() === teamAbbr ||
      game.awayAbbr.toUpperCase() === teamAbbr
    ) {
      days.add(game.date)
    }
  }

  return days
}

export const dayOpponentLabel = (
  player: SeasonPlayer | undefined,
  day: string,
  schedule: ScheduleResponse,
): string => {
  const teamAbbr = player?.teamAbbr?.toUpperCase()
  if (!teamAbbr) return "no game"

  const labels: string[] = []

  for (const game of schedule.games) {
    if (game.date !== day) continue

    if (game.homeAbbr.toUpperCase() === teamAbbr) {
      labels.push(`vs ${game.awayAbbr.toUpperCase()}`)
    } else if (game.awayAbbr.toUpperCase() === teamAbbr) {
      labels.push(`@${game.homeAbbr.toUpperCase()}`)
    }
  }

  return labels.length > 0 ? labels.join(", ") : "no game"
}

export const effectiveGamesByPlayerId = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Map<string, number> => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const counts = new Map<string, number>()

  for (const [day, entries] of Object.entries(daily)) {
    for (const entry of entries) {
      if (!entry.playerId) continue

      const player = playersById.get(entry.playerId)
      if (!player) continue

      const teamAbbr = player.teamAbbr
      if (!teamAbbr) continue

      const gameWeight = gameWeightForTeamDate(teamAbbr, day, schedule)
      if (gameWeight === 0) continue

      counts.set(entry.playerId, (counts.get(entry.playerId) ?? 0) + gameWeight)
    }
  }

  return counts
}

export const youTotalsFromDaily = (
  daily: DailyLineups,
  players: SeasonPlayer[],
  schedule: ScheduleResponse,
): Record<CategoryId, number> => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const gamesMap = effectiveGamesByPlayerId(daily, players, schedule)
  const totals = emptyTotals()
  let totalFGM = 0
  let totalFGA = 0
  let totalFTM = 0
  let totalFTA = 0

  const playerIds = new Set<string>()
  for (const entries of Object.values(daily)) {
    for (const entry of entries) {
      if (entry.playerId) playerIds.add(entry.playerId)
    }
  }

  for (const playerId of playerIds) {
    const player = playersById.get(playerId)
    if (!player) continue

    const weekly = weeklyPlayerStats(player, gamesMap.get(playerId) ?? 0)

    for (const categoryId of COUNTING_CATEGORIES) {
      totals[categoryId] += weekly.projections[categoryId]
    }

    totalFGM += weekly.shooting.FGM
    totalFGA += weekly.shooting.FGA
    totalFTM += weekly.shooting.FTM
    totalFTA += weekly.shooting.FTA
  }

  totals.FG_PCT = totalFGA > 0 ? totalFGM / totalFGA : 0
  totals.FT_PCT = totalFTA > 0 ? totalFTM / totalFTA : 0

  return totals
}

export const setSlotPlayer = (
  daily: DailyLineups,
  day: string,
  slotIndex: number,
  playerId: string | null,
): DailyLineups => {
  const entries = daily[day]
  if (!entries || slotIndex < 0 || slotIndex >= entries.length) {
    return daily
  }

  const nextEntries = entries.map((entry, index) => {
    if (index === slotIndex) {
      return { ...entry, playerId }
    }

    if (playerId !== null && entry.playerId === playerId) {
      return { ...entry, playerId: null }
    }

    return entry
  })

  return {
    ...daily,
    [day]: nextEntries,
  }
}

export type TogglePlayerDayResult = {
  daily: DailyLineups
  status: "started" | "sat" | "no_game" | "full" | "ineligible" | "missing_day"
}

export const findPlayerSlotIndex = (
  daily: DailyLineups,
  day: string,
  playerId: string,
): number => {
  const entries = daily[day]
  if (!entries) return -1

  return entries.findIndex((entry) => entry.playerId === playerId)
}

/** Weekly roster order: PG, SG, SF, PF, C, G, F, UTIL×3, BE×3, IL. */
export const sortPlayerIdsByLineupSlots = (
  playerIds: string[],
  daily: DailyLineups,
  sortDay: string | null,
  weeklyIndexByPlayerId: Record<string, number>,
): string[] => {
  const startedIndex = (playerId: string) =>
    sortDay ? findPlayerSlotIndex(daily, sortDay, playerId) : -1

  return [...playerIds].sort((left, right) => {
    if (sortDay) {
      const leftStarted = startedIndex(left)
      const rightStarted = startedIndex(right)
      const leftKey =
        leftStarted >= 0
          ? leftStarted
          : 100 + (weeklyIndexByPlayerId[left] ?? 999)
      const rightKey =
        rightStarted >= 0
          ? rightStarted
          : 100 + (weeklyIndexByPlayerId[right] ?? 999)
      if (leftKey !== rightKey) return leftKey - rightKey
    } else {
      const leftKey = weeklyIndexByPlayerId[left] ?? 999
      const rightKey = weeklyIndexByPlayerId[right] ?? 999
      if (leftKey !== rightKey) return leftKey - rightKey
    }

    return left.localeCompare(right)
  })
}

export type LineupDisplaySlot = SeasonSlot | "PV"

export type DailySlotRow = {
  slot: LineupDisplaySlot
  playerId: string | null
  slotOccurrence: number
}

export type LineupDisplayFocus = {
  focusDay?: string
  schedule?: ScheduleResponse
  playersById?: Record<string, SeasonPlayer>
  daily?: DailyLineups
}

const isActiveDisplaySlot = (slot: LineupDisplaySlot) =>
  slot !== "BE" && slot !== "IL" && slot !== "PV"

/**
 * Weekly roster seats as display rows: one row per league seat (including extra
 * G/UTIL/BE), expandable IL, then leftover preview streamers as PV. When focus
 * inputs are present, occupants are the focused day's daily seats.
 */
export const buildLineupDisplayRows = (
  rosterEntries: SeasonRosterEntry[],
  extraPlayerIds: string[] = [],
  extraIlPlayerIds: string[] = [],
  focus?: LineupDisplayFocus,
): DailySlotRow[] => {
  const seats =
    rosterEntries.length > 0
      ? rosterEntries
      : SEASON_ROSTER_SLOTS.map((slot) => ({ slot, playerId: null }))

  const rows: DailySlotRow[] = []
  const seen: Partial<Record<SeasonSlot, number>> = {}
  for (const entry of seats) {
    if (entry.slot === "IL") continue
    const slotOccurrence = seen[entry.slot] ?? 0
    seen[entry.slot] = slotOccurrence + 1
    rows.push({
      slot: entry.slot,
      playerId: entry.playerId,
      slotOccurrence,
    })
  }

  const ilIds = [
    ...rosterEntries.flatMap((entry) =>
      entry.slot === "IL" && entry.playerId ? [entry.playerId] : [],
    ),
    ...extraIlPlayerIds,
  ].filter((id, index, all) => all.indexOf(id) === index)

  const ilRows: DailySlotRow[] =
    ilIds.length > 0
      ? ilIds.map((playerId, slotOccurrence) => ({
          slot: "IL" as const,
          playerId,
          slotOccurrence,
        }))
      : [{ slot: "IL", playerId: null, slotOccurrence: 0 }]

  const previewFromExtras = (placed: Set<string>): DailySlotRow[] =>
    extraPlayerIds
      .filter((playerId) => !placed.has(playerId))
      .filter((playerId, index, all) => all.indexOf(playerId) === index)
      .map((playerId, slotOccurrence) => ({
        slot: "PV" as const,
        playerId,
        slotOccurrence,
      }))

  const focusDay = focus?.focusDay
  const schedule = focus?.schedule
  const playersById = focus?.playersById
  const daily = focus?.daily
  if (!focusDay || !schedule || !playersById || !daily) {
    const placed = new Set(
      [...rows, ...ilRows].flatMap((row) =>
        row.playerId ? [row.playerId] : [],
      ),
    )
    return [...rows, ...ilRows, ...previewFromExtras(placed)]
  }

  const lookup = (playerId: string) => playersById[playerId]

  const homeRowFor = (playerId: string): DailySlotRow | undefined => {
    const homeSeen: Partial<Record<SeasonSlot, number>> = {}
    for (const entry of rosterEntries) {
      if (entry.slot === "IL") continue
      const slotOccurrence = homeSeen[entry.slot] ?? 0
      homeSeen[entry.slot] = slotOccurrence + 1
      if (entry.playerId === playerId) {
        return rows.find(
          (row) =>
            row.slot === entry.slot && row.slotOccurrence === slotOccurrence,
        )
      }
    }
  }

  const placeOn = (row: DailySlotRow | undefined, playerId: string) => {
    if (!row || row.playerId !== null) return false
    row.playerId = playerId
    return true
  }

  const firstEmpty = (matches: (row: DailySlotRow) => boolean) =>
    rows.find((row) => row.playerId === null && matches(row))

  const placeEligibleActive = (playerId: string) => {
    const player = lookup(playerId)
    return placeOn(
      firstEmpty(
        (row) =>
          isActiveDisplaySlot(row.slot) &&
          eligibleForSlot(player, row.slot as SeasonSlot),
      ),
      playerId,
    )
  }

  const placeSitOrStart = (playerId: string) => {
    const player = lookup(playerId)
    const home = homeRowFor(playerId)
    if (
      home &&
      isActiveDisplaySlot(home.slot) &&
      eligibleForSlot(player, home.slot)
    ) {
      if (placeOn(home, playerId)) return true
    }
    if (placeEligibleActive(playerId)) return true
    return placeOn(firstEmpty((row) => row.slot === "BE"), playerId)
  }

  for (const row of rows) {
    row.playerId = null
  }

  const placed = new Set(
    ilRows.flatMap((row) => (row.playerId ? [row.playerId] : [])),
  )
  const displayable = new Set([
    ...rosterEntries.flatMap((entry) =>
      entry.playerId && entry.slot !== "IL" ? [entry.playerId] : [],
    ),
    ...extraPlayerIds,
  ])
  const dayEntries = daily[focusDay] ?? []
  const startedIds = new Set(
    dayEntries.flatMap((entry) =>
      entry.playerId && displayable.has(entry.playerId) ? [entry.playerId] : [],
    ),
  )

  const usedOcc: Partial<Record<SeasonSlot, number>> = {}
  for (const entry of dayEntries) {
    const slotOccurrence = usedOcc[entry.slot] ?? 0
    usedOcc[entry.slot] = slotOccurrence + 1
    if (
      !entry.playerId ||
      placed.has(entry.playerId) ||
      !displayable.has(entry.playerId)
    ) {
      continue
    }
    const row = rows.find(
      (candidate) =>
        candidate.slot === entry.slot &&
        candidate.slotOccurrence === slotOccurrence,
    )
    if (placeOn(row, entry.playerId)) placed.add(entry.playerId)
  }
  for (const playerId of startedIds) {
    if (placed.has(playerId)) continue
    if (placeSitOrStart(playerId) || placeOn(firstEmpty(() => true), playerId)) {
      placed.add(playerId)
    }
  }

  const playerHasGame = (playerId: string) => {
    const teamAbbr = lookup(playerId)?.teamAbbr
    if (!teamAbbr) return false
    return gameWeightForTeamDate(teamAbbr, focusDay, schedule) > 0
  }

  const placeOffNight = (playerId: string) => {
    const player = lookup(playerId)
    const home = homeRowFor(playerId)
    if (
      home &&
      isActiveDisplaySlot(home.slot) &&
      eligibleForSlot(player, home.slot)
    ) {
      if (placeOn(home, playerId)) return true
    }
    return placeEligibleActive(playerId)
  }

  for (const entry of rosterEntries) {
    if (entry.slot === "IL" || !entry.playerId) continue
    if (placed.has(entry.playerId) || playerHasGame(entry.playerId)) continue
    if (placeOffNight(entry.playerId)) placed.add(entry.playerId)
  }

  for (const entry of rosterEntries) {
    if (entry.slot === "IL" || !entry.playerId) continue
    if (placed.has(entry.playerId)) continue
    if (placeOn(firstEmpty((row) => row.slot === "BE"), entry.playerId)) {
      placed.add(entry.playerId)
      continue
    }
    rows.push({
      slot: "BE",
      playerId: entry.playerId,
      slotOccurrence: rows.filter((row) => row.slot === "BE").length,
    })
    placed.add(entry.playerId)
  }

  return [...rows, ...ilRows, ...previewFromExtras(placed)]
}

export const togglePlayerDay = (
  daily: DailyLineups,
  day: string,
  playerId: string,
  hasGame: boolean,
  playersById: Record<string, SeasonPlayer>,
  rosterSlots?: SeasonSlot[],
  schedule?: ScheduleResponse,
): TogglePlayerDayResult => {
  const entries = daily[day]
  if (!entries) {
    return { daily, status: "missing_day" }
  }

  if (!hasGame) {
    return { daily, status: "no_game" }
  }

  const existingIndex = findPlayerSlotIndex(daily, day, playerId)
  if (existingIndex >= 0) {
    return {
      daily: setSlotPlayer(daily, day, existingIndex, null),
      status: "sat",
    }
  }

  const slotIsOpenForStart = (entry: SeasonRosterEntry): boolean => {
    if (entry.playerId === null) return true
    if (!schedule) return false

    const occupant = playersById[entry.playerId]
    const teamAbbr = occupant?.teamAbbr
    if (!teamAbbr) return false

    return gameWeightForTeamDate(teamAbbr, day, schedule) === 0
  }

  const hasOpenSlot = entries.some(slotIsOpenForStart)
  if (!hasOpenSlot) {
    return { daily, status: "full" }
  }

  const player = playersById[playerId]
  const openIndex = entries.findIndex(
    (entry) =>
      slotIsOpenForStart(entry) &&
      (!rosterSlots || rosterSlots.includes(entry.slot)) &&
      eligibleForSlot(player, entry.slot),
  )
  if (openIndex < 0) {
    return { daily, status: "ineligible" }
  }

  return {
    daily: setSlotPlayer(daily, day, openIndex, playerId),
    status: "started",
  }
}

/**
 * True when every active slot that day is filled by a player with a game
 * (same gate as `togglePlayerDay` → `"full"`).
 */
export const isDailyLineupFullForDate = (
  daily: DailyLineups,
  date: string,
  playersById: Record<string, SeasonPlayer> | Map<string, SeasonPlayer>,
  schedule: ScheduleResponse,
): boolean => {
  const entries = daily[date]
  if (!entries?.length) return false

  const resolvePlayer = (playerId: string) =>
    playersById instanceof Map ? playersById.get(playerId) : playersById[playerId]

  const slotIsOpenForStart = (entry: SeasonRosterEntry): boolean => {
    if (entry.playerId === null) return true

    const occupant = resolvePlayer(entry.playerId)
    const teamAbbr = occupant?.teamAbbr
    if (!teamAbbr) return false

    return gameWeightForTeamDate(teamAbbr, date, schedule) === 0
  }

  return !entries.some(slotIsOpenForStart)
}
