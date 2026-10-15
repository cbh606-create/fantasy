import { useState } from "react"
import {
  buildLineupDisplayRows,
  dayOpponentLabel,
  findPlayerSlotIndex,
  type DailyLineups,
} from "@/lib/matchup/dailyLineups"
import {
  isB2bSecondNight,
  playerHasGameOnDate,
  teamHasGameOnDate,
} from "@/lib/matchup/games"
import type { TogglePlayerDayResult } from "@/lib/matchup/dailyLineups"
import {
  MATCHUP_WEEK_DAY_COL_CLASS,
  MATCHUP_WEEK_PLAYER_COL_CLASS,
  MATCHUP_WEEK_SLOT_COL_CLASS,
  MATCHUP_WEEK_TABLE_CLASS,
  formatMatchupDayLabel,
} from "@/lib/matchup/weekCalendarLayout"
import type {
  OpponentStreamDay,
  OpponentStreamDayCell,
} from "@/lib/matchup/types"
import { formatPlayerPositions, slotDisplayLabel } from "@/lib/season/slotLabels"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

const ADD_INDEX_COLOR_CLASS = [
  "text-[var(--color-success)]",
  "text-[#b45309]",
  "text-[#0369a1]",
  "text-[#be123c]",
  "text-[#0f766e]",
  "text-[#c2410c]",
  "text-[#4d7c0f]",
] as const

const addIndexColorClass = (addIndex: number) =>
  ADD_INDEX_COLOR_CLASS[(addIndex - 1) % ADD_INDEX_COLOR_CLASS.length] ??
  "text-[var(--color-mute)]"

const streamerLabel = (
  playerId: string | null | undefined,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!playerId) return "—"
  return playersById[playerId]?.name ?? "—"
}

const shortOpponentLabel = (label: string) => {
  if (label === "no game") return "—"
  return label.replace(/^vs\s+/i, "v ").replace(/\s+/g, " ")
}

const slotLabel = (slot: string) =>
  slot === "BE" ? "BE" : slot === "PV" ? "PV" : slotDisplayLabel(slot as never)

const formatOppMove = (
  cell: OpponentStreamDayCell | undefined,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!cell) return "—"
  const addName = streamerLabel(cell.playerId, playersById)
  const dropName = streamerLabel(cell.droppedPlayerId, playersById)
  if (cell.action === "hold" && cell.playerId) return addName
  if (cell.action === "empty" || (!cell.playerId && !cell.droppedPlayerId)) {
    return "—"
  }
  if (dropName === "—" && addName !== "—") return `— → ${addName}`
  if (addName === "—") return dropName
  return `${dropName} → ${addName}`
}

const fallbackCells = (
  oppDay: OpponentStreamDay | undefined,
  spotCount: number,
): OpponentStreamDayCell[] => {
  if (oppDay?.cells && oppDay.cells.length > 0) return oppDay.cells
  return Array.from({ length: spotCount }, (_, spotIndex) => ({
    spotIndex,
    playerId: spotIndex === 0 ? (oppDay?.streamerPlayerId ?? null) : null,
    droppedPlayerId: spotIndex === 0 ? (oppDay?.droppedPlayerId ?? null) : null,
    action:
      spotIndex === 0 && oppDay?.streamerPlayerId
        ? oppDay.droppedPlayerId
          ? "drop_add"
          : "add"
        : "empty",
    addIndex: null,
  }))
}

const cellsForDay = (day: OpponentStreamDay | undefined): OpponentStreamDayCell[] => {
  if (day?.cells && day.cells.length > 0) return day.cells
  if (!day?.streamerPlayerId && !day?.droppedPlayerId) return []
  return [
    {
      spotIndex: 0,
      playerId: day.streamerPlayerId,
      droppedPlayerId: day.droppedPlayerId,
      action: day.droppedPlayerId ? "drop_add" : day.streamerPlayerId ? "add" : "empty",
      addIndex: null,
    },
  ]
}

/** Dates a player is on the opponent roster. Adds start that day; drops leave that day. */
export const opponentRosteredDatesByPlayerId = (
  matchupDays: readonly string[],
  rosterEntries: readonly SeasonRosterEntry[],
  opponentDays: readonly OpponentStreamDay[],
): Map<string, Set<string>> => {
  const rosterIds = new Set(
    rosterEntries.flatMap((entry) =>
      entry.slot !== "IL" && entry.playerId ? [entry.playerId] : [],
    ),
  )
  const dayByDate = new Map(opponentDays.map((day) => [day.date, day]))
  const sortedDays = [...matchupDays].sort()
  const involved = new Set<string>()
  for (const day of opponentDays) {
    for (const cell of cellsForDay(day)) {
      if (cell.playerId) involved.add(cell.playerId)
      if (cell.droppedPlayerId) involved.add(cell.droppedPlayerId)
    }
  }

  const firstMoveIsAdd = (playerId: string) => {
    for (const date of sortedDays) {
      const cells = cellsForDay(dayByDate.get(date))
      const added = cells.some(
        (cell) =>
          cell.playerId === playerId &&
          (cell.action === "add" || cell.action === "drop_add"),
      )
      const dropped = cells.some((cell) => cell.droppedPlayerId === playerId)
      const listed = cells.some(
        (cell) => cell.playerId === playerId && cell.action !== "empty",
      )
      if (!added && !dropped && !listed) continue
      return added && !dropped
    }
    return false
  }

  const track = (playerId: string, startsActive: boolean) => {
    let active = startsActive
    const owned = new Set<string>()
    for (const date of sortedDays) {
      const cells = cellsForDay(dayByDate.get(date))
      const listed = cells.some(
        (cell) => cell.playerId === playerId && cell.action !== "empty",
      )
      const dropped = cells.some((cell) => cell.droppedPlayerId === playerId)
      if (listed) active = true
      if (dropped && !listed) active = false
      if (active) owned.add(date)
    }
    return owned
  }

  const dates = new Map<string, Set<string>>()
  for (const playerId of rosterIds) {
    dates.set(
      playerId,
      involved.has(playerId)
        ? track(playerId, !firstMoveIsAdd(playerId))
        : new Set(sortedDays),
    )
  }
  for (const playerId of involved) {
    if (rosterIds.has(playerId)) continue
    dates.set(playerId, track(playerId, false))
  }
  return dates
}

const extraPlayerIdsFromDaily = (
  daily: DailyLineups,
  rosterEntries: SeasonRosterEntry[],
): string[] => {
  const rosterIds = new Set(
    rosterEntries.flatMap((entry) =>
      entry.playerId ? [entry.playerId] : [],
    ),
  )
  const extras: string[] = []
  const seen = new Set<string>()
  for (const entries of Object.values(daily)) {
    for (const entry of entries) {
      if (!entry.playerId || rosterIds.has(entry.playerId)) continue
      if (seen.has(entry.playerId)) continue
      seen.add(entry.playerId)
      extras.push(entry.playerId)
    }
  }
  return extras
}

export const OpponentWeekStrip = ({
  days,
  opponentName,
  opponentDays,
  opponentDaily,
  opponentEntries = [],
  schedule,
  playersById,
  oppSpotCount = 1,
  closedDates = [],
  onTogglePlayerDay,
}: {
  days: string[]
  opponentName: string
  opponentDays: OpponentStreamDay[]
  opponentDaily?: DailyLineups
  opponentEntries?: SeasonRosterEntry[]
  schedule?: ScheduleResponse
  playersById: Record<string, SeasonPlayer>
  oppSpotCount?: 0 | 1 | 2 | 3
  closedDates?: string[]
  onTogglePlayerDay?: (
    playerId: string,
    day: string,
  ) => TogglePlayerDayResult["status"]
}) => {
  const [focusDay, setFocusDay] = useState(days[0] ?? "")
  const [hint, setHint] = useState("")
  const closedDateSet = new Set(closedDates)
  const activeFocusDay = days.includes(focusDay) ? focusDay : (days[0] ?? "")
  const dayByDate = Object.fromEntries(
    opponentDays.map((day) => [day.date, day]),
  )
  const spotCount =
    oppSpotCount === 0
      ? 0
      : (Math.max(
          oppSpotCount,
          ...opponentDays.map((day) => day.cells?.length ?? 0),
          1,
        ) as number)
  const daily = opponentDaily ?? {}
  const showLineup = Boolean(
    schedule && Object.keys(daily).length > 0 && opponentEntries.length > 0,
  )
  const extras = showLineup
    ? extraPlayerIdsFromDaily(daily, opponentEntries)
    : []
  const rosteredDatesByPlayerId = opponentRosteredDatesByPlayerId(
    days,
    opponentEntries,
    opponentDays,
  )
  const slotRows = showLineup
    ? buildLineupDisplayRows(opponentEntries, extras, [], {
        focusDay: activeFocusDay,
        schedule,
        playersById,
        daily,
      })
    : []

  const dayColClassName = (day: string, extrasClass: string) =>
    `${MATCHUP_WEEK_DAY_COL_CLASS} ${extrasClass}${
      day === activeFocusDay ? " bg-[var(--color-soft-cloud)]/80" : ""
    }`

  const startedGameCountForDay = (day: string) => {
    if (!schedule) return dayByDate[day]?.rosterGameCount ?? 0
    let count = 0
    for (const entry of daily[day] ?? []) {
      if (!entry.playerId) continue
      const player = playersById[entry.playerId]
      if (!player?.teamAbbr) continue
      if (teamHasGameOnDate(player.teamAbbr, day, schedule)) count += 1
    }
    return count
  }

  return (
    <section aria-label="Opponent week">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] px-2 py-1.5 text-[0.75rem]">
        <p className="font-medium text-[var(--color-ink)]">{opponentName}</p>
        <p className="text-[var(--color-mute)]">
          Sit a game to simulate an injury or B2B
        </p>
        {hint ? <p className="text-[var(--color-ink)]">{hint}</p> : null}
      </div>
      <table
        className={`${MATCHUP_WEEK_TABLE_CLASS} text-left text-[0.6875rem] leading-tight`}
      >
        <colgroup>
          <col className={MATCHUP_WEEK_SLOT_COL_CLASS} />
          <col className={MATCHUP_WEEK_PLAYER_COL_CLASS} />
          {days.map((day) => (
            <col className={MATCHUP_WEEK_DAY_COL_CLASS} key={day} />
          ))}
        </colgroup>
        <thead className="bg-[var(--color-soft-cloud)] text-[0.625rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
          <tr>
            <th
              className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 bg-[var(--color-soft-cloud)] px-2 py-1 font-medium`}
              scope="col"
            >
              Slot
            </th>
            <th
              className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 bg-[var(--color-soft-cloud)] px-2 py-1 font-medium`}
              scope="col"
            >
              Player
            </th>
            {days.map((day) => (
              <th
                className={dayColClassName(day, "px-1 py-1 text-center font-medium")}
                key={day}
                scope="col"
              >
                <button
                  aria-label={`Highlight opp ${formatMatchupDayLabel(day)}`}
                  aria-pressed={activeFocusDay === day}
                  className={`rounded-full px-1 py-0.5 font-medium tracking-[0.08em] uppercase whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    activeFocusDay === day
                      ? "bg-[var(--color-ink)] text-white"
                      : "hover:bg-white/70 hover:text-[var(--color-ink)]"
                  }`}
                  onClick={() => setFocusDay(day)}
                  type="button"
                >
                  {formatMatchupDayLabel(day)}
                </button>
              </th>
            ))}
          </tr>
          <tr className="border-t border-[var(--color-hairline)] text-[var(--color-ink)]">
            <th
              className="sticky left-0 z-10 bg-[var(--color-soft-cloud)] px-2 py-1 text-left font-medium normal-case tracking-normal"
              colSpan={2}
              scope="row"
            >
              Games
            </th>
            {days.map((day) => {
              const games = showLineup
                ? startedGameCountForDay(day)
                : (dayByDate[day]?.rosterGameCount ?? 0)
              return (
                <td
                  aria-label={`Opp ${formatMatchupDayLabel(day)}: ${games} games`}
                  className={dayColClassName(
                    day,
                    "px-1 py-1 text-center font-medium tabular-nums normal-case tracking-normal",
                  )}
                  key={`${day}-games`}
                >
                  {games}
                </td>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {slotRows.map((row, rowIndex) => {
            const player = row.playerId
              ? playersById[row.playerId] ?? null
              : null
            const isPreview = row.slot === "PV"
            return (
              <tr
                className={
                  isPreview
                    ? "border-t border-dashed border-[var(--color-hairline)]"
                    : "border-t border-[var(--color-hairline)]"
                }
                key={`${row.slot}-${rowIndex}`}
              >
                <th
                  className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 whitespace-nowrap bg-[var(--color-canvas)] px-2 py-1 font-semibold tracking-wide text-[var(--color-mute)]`}
                  scope="row"
                >
                  {slotLabel(row.slot)}
                </th>
                <td
                  className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 overflow-hidden bg-[var(--color-canvas)] px-1.5 py-0.5 font-medium whitespace-nowrap`}
                >
                  {player ? (
                    <span className="min-w-0 truncate text-[0.6875rem] leading-tight">
                      {player.name}
                      {isPreview ? (
                        <span className="ml-1 rounded-full border border-dashed border-[var(--color-hairline)] px-1 py-px text-[0.5rem] font-normal tracking-wide text-[var(--color-mute)] uppercase">
                          stream
                        </span>
                      ) : null}
                      <span className="ml-1 font-normal text-[var(--color-mute)]">
                        {formatPlayerPositions(player)}
                        {player.teamAbbr ? ` · ${player.teamAbbr}` : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="font-normal text-[var(--color-mute)]">
                      —
                    </span>
                  )}
                </td>
                {days.map((day) => {
                  if (!player || !schedule) {
                    return (
                      <td
                        className={dayColClassName(day, "px-1 py-0.5 text-center")}
                        key={day}
                      >
                        <span className="inline-flex h-6 min-w-[3rem] items-center justify-center text-[var(--color-mute)]">
                          —
                        </span>
                      </td>
                    )
                  }
                  const started =
                    findPlayerSlotIndex(daily, day, player.id) >= 0
                  const teamPlays = player.teamAbbr
                    ? teamHasGameOnDate(player.teamAbbr, day, schedule)
                    : false
                  const available = playerHasGameOnDate(player, day, schedule)
                  const dayLabel = formatMatchupDayLabel(day)
                  if (!teamPlays) {
                    return (
                      <td
                        className={dayColClassName(day, "px-1 py-0.5 text-center")}
                        key={day}
                      >
                        <span
                          aria-label={`${player.name} no game ${dayLabel}`}
                          className="inline-flex h-6 min-w-[3rem] items-center justify-center text-[var(--color-mute)]"
                        >
                          —
                        </span>
                      </td>
                    )
                  }
                  if (!available || row.slot === "IL") {
                    const onIr = row.slot === "IL" && available
                    return (
                      <td
                        className={dayColClassName(day, "px-1 py-0.5 text-center")}
                        key={day}
                      >
                        <span
                          aria-label={
                            onIr
                              ? `${player.name} on IR ${dayLabel}`
                              : `${player.name} out ${dayLabel}`
                          }
                          className="inline-flex h-6 min-w-[3rem] items-center justify-center text-[0.625rem] font-medium text-[var(--color-mute)]"
                        >
                          {onIr ? "IR" : "OUT"}
                        </span>
                      </td>
                    )
                  }
                  const shortLabel = shortOpponentLabel(
                    dayOpponentLabel(player, day, schedule),
                  )
                  const isClosed = closedDateSet.has(day)
                  const rosteredDates = rosteredDatesByPlayerId.get(player.id)
                  const offRoster = Boolean(rosteredDates && !rosteredDates.has(day))
                  const isB2b = player.teamAbbr
                    ? isB2bSecondNight(player.teamAbbr, day, schedule)
                    : false
                  const handleToggle = () => {
                    if (!onTogglePlayerDay || isClosed || offRoster) return
                    const status = onTogglePlayerDay(player.id, day)
                    if (status === "full") {
                      setHint("No open slot that day — sit someone who has a game first")
                      return
                    }
                    if (status === "ineligible") {
                      setHint(`${player.name} is not eligible for an open slot that day`)
                      return
                    }
                    setHint("")
                  }
                  return (
                    <td
                      className={dayColClassName(day, "px-1 py-0.5 text-center")}
                      key={day}
                    >
                      <button
                        aria-label={
                          offRoster
                            ? `${player.name} not on roster ${dayLabel}`
                            : isClosed
                              ? `${player.name} recorded on ${dayLabel}`
                              : `${started ? "Sit" : "Start"} ${player.name} on ${dayLabel}`
                        }
                        aria-pressed={isClosed || offRoster ? undefined : started}
                        className={`inline-flex h-6 min-w-[3rem] items-center justify-center whitespace-nowrap rounded-md px-1 text-[0.625rem] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed ${
                          offRoster || isClosed
                            ? "border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] text-[var(--color-mute)] opacity-70"
                            : started
                              ? "bg-[var(--color-ink)] text-white"
                              : "border border-[var(--color-hairline)] bg-white text-[var(--color-ink)]"
                        }`}
                        disabled={isClosed || offRoster || !onTogglePlayerDay}
                        onClick={handleToggle}
                        type="button"
                      >
                        {shortLabel}
                        {isB2b && !isClosed ? (
                          <span className="ml-0.5 text-[0.5rem] font-semibold tracking-wide opacity-70">
                            B2B
                          </span>
                        ) : null}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {Array.from({ length: spotCount }, (_, spotIndex) => (
            <tr
              className="border-t border-[var(--color-hairline)]"
              key={`opp-spot-${spotIndex}`}
            >
              <th
                className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 bg-[var(--color-canvas)] px-2 py-1 font-semibold tracking-wide text-[var(--color-mute)]`}
                scope="row"
              >
                {spotCount > 1 ? `S${spotIndex + 1}` : "Str"}
              </th>
              <th
                className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 bg-[var(--color-canvas)] px-2 py-1 font-medium text-[var(--color-mute)]`}
                scope="row"
              >
                {spotCount > 1 ? `Spot ${spotIndex + 1}` : "Stream"}
              </th>
              {days.map((day) => {
                const cell = fallbackCells(dayByDate[day], spotCount)[spotIndex]
                const move = formatOppMove(cell, playersById)
                const addIndex = cell?.addIndex
                return (
                  <td
                    aria-label={`Opp ${formatMatchupDayLabel(day)} spot ${spotIndex + 1}: ${move}`}
                    className={dayColClassName(
                      day,
                      "px-1 py-1 align-top text-[0.625rem] leading-tight text-[var(--color-ink)]",
                    )}
                    key={`${day}-spot-${spotIndex}`}
                  >
                    <span className="inline-flex max-w-full flex-wrap items-baseline gap-0.5">
                      <span>{move}</span>
                      {addIndex != null ? (
                        <span
                          aria-label={`Opp add ${addIndex}`}
                          className={`text-[0.6875rem] font-semibold tabular-nums ${addIndexColorClass(addIndex)}`}
                        >
                          {addIndex}
                        </span>
                      ) : null}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
