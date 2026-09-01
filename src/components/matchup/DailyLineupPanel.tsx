"use client"

import { useState } from "react"
import type {
  DailyLineups,
  DailySlotRow,
  TogglePlayerDayResult,
} from "@/lib/matchup/dailyLineups"
import {
  buildLineupDisplayRows,
  dayOpponentLabel,
  findPlayerSlotIndex,
} from "@/lib/matchup/dailyLineups"
import {
  gameWeightForTeamDate,
  isB2bSecondNight,
} from "@/lib/matchup/games"
import {
  MATCHUP_WEEK_DAY_COL_CLASS,
  MATCHUP_WEEK_PLAYER_COL_CLASS,
  MATCHUP_WEEK_SLOT_COL_CLASS,
  MATCHUP_WEEK_TABLE_CLASS,
  formatMatchupDayLabel,
} from "@/lib/matchup/weekCalendarLayout"
import { formatPlayerPositions, slotDisplayLabel } from "@/lib/season/slotLabels"
import type {
  ScheduleResponse,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

type DailyLineupPanelProps = {
  days: string[]
  daily: DailyLineups
  rosterPlayers: SeasonPlayer[]
  schedule: ScheduleResponse
  onTogglePlayerDay: (
    playerId: string,
    day: string,
  ) => TogglePlayerDayResult["status"]
  onReset: () => void
  previewActive?: boolean
  previewSpotCount?: 1 | 2 | 3
  previewPlayerIds?: Set<string> | string[]
  /** Player id → ISO date from which plan drop locks their cells. */
  droppedFromDateByPlayerId?: Record<string, string>
  /** Preview streamer id → dates they occupy a plan spot (lock other game days). */
  streamerOwnedDatesByPlayerId?: Record<string, ReadonlySet<string> | string[]>
  extraPlayers?: SeasonPlayer[]
  /** Sit/start hints keyed by player id — shown on that player's game cells. */
  sitStartBadgesByPlayerId?: Record<string, string>
  /** Players currently on the IL/IR roster slot — shade game cells only. */
  ilPlayerIds?: Set<string> | string[]
  /** Weekly roster seats (PG→IR). Empty slots stay as empty rows. */
  rosterEntries?: SeasonRosterEntry[]
}

const toDateSet = (
  dates?: ReadonlySet<string> | string[],
): ReadonlySet<string> => (dates instanceof Set ? dates : new Set(dates ?? []))

const toIdSet = (ids?: Set<string> | string[]) =>
  ids instanceof Set ? ids : new Set(ids ?? [])

const shortOpponentLabel = (label: string) => {
  if (label === "no game") return "—"
  return label.replace(/^vs\s+/i, "v ").replace(/\s+/g, " ")
}

const slotLabel = (slot: DailySlotRow["slot"]) =>
  slot === "BE" ? "BE" : slot === "PV" ? "PV" : slotDisplayLabel(slot)

export const DailyLineupPanel = ({
  days,
  daily,
  rosterPlayers,
  schedule,
  onTogglePlayerDay,
  onReset,
  previewActive = false,
  previewSpotCount,
  previewPlayerIds,
  droppedFromDateByPlayerId = {},
  streamerOwnedDatesByPlayerId = {},
  extraPlayers,
  sitStartBadgesByPlayerId = {},
  ilPlayerIds,
  rosterEntries = [],
}: DailyLineupPanelProps) => {
  const [hint, setHint] = useState("")
  const [focusDay, setFocusDay] = useState(days[0] ?? "")
  const previewIds = toIdSet(previewPlayerIds)
  const onIlIds = toIdSet(ilPlayerIds)
  const rowPlayers = [...rosterPlayers]
  const seenIds = new Set(rosterPlayers.map((player) => player.id))
  for (const extra of extraPlayers ?? []) {
    if (seenIds.has(extra.id)) continue
    rowPlayers.push(extra)
    seenIds.add(extra.id)
  }

  const playersById = new Map(rowPlayers.map((player) => [player.id, player]))
  const activeFocusDay = days.includes(focusDay) ? focusDay : (days[0] ?? "")
  const slotRows = buildLineupDisplayRows(
    rosterEntries,
    [...previewIds],
    [...onIlIds],
    {
      focusDay: activeFocusDay,
      schedule,
      playersById: Object.fromEntries(playersById),
      daily,
    },
  )
  const dayColClassName = (day: string, extras: string) =>
    `${MATCHUP_WEEK_DAY_COL_CLASS} ${extras}${
      day === activeFocusDay ? " bg-[var(--color-soft-cloud)]/80" : ""
    }`

  const startedGameCountForDay = (day: string) => {
    const entries = daily[day] ?? []
    let count = 0

    for (const entry of entries) {
      if (!entry.playerId) continue
      const player = playersById.get(entry.playerId)
      const teamAbbr = player?.teamAbbr
      if (!teamAbbr) continue
      if (gameWeightForTeamDate(teamAbbr, day, schedule) > 0) count += 1
    }

    return count
  }

  const handleToggle = (
    player: SeasonPlayer,
    day: string,
    hasGame: boolean,
    locked: boolean,
    onIl: boolean,
  ) => {
    if (locked || !hasGame) return
    if (onIl) {
      setHint("On IR — move off IL on Roster to start")
      return
    }

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

  const renderDayCell = (
    player: SeasonPlayer | null,
    day: string,
    onIl: boolean,
  ) => {
    if (!player) {
      return (
        <td className={dayColClassName(day, "px-1 py-1 text-center")} key={day}>
          <span className="inline-flex h-9 min-w-[3.75rem] items-center justify-center text-[var(--color-mute)]">
            —
          </span>
        </td>
      )
    }

    const isPreview = previewIds.has(player.id)
    const droppedFrom = droppedFromDateByPlayerId[player.id]
    const ownedDates = isPreview
      ? toDateSet(streamerOwnedDatesByPlayerId[player.id])
      : null
    const isDropped = Boolean(droppedFrom && day >= droppedFrom)
    const isOutsideStreamerWindow = Boolean(
      ownedDates && !ownedDates.has(day),
    )
    const isLocked = isDropped || isOutsideStreamerWindow
    const teamAbbr = player.teamAbbr ?? ""
    const gameWeight = teamAbbr
      ? gameWeightForTeamDate(teamAbbr, day, schedule)
      : 0
    const hasGame = gameWeight > 0
    const isB2b = teamAbbr
      ? isB2bSecondNight(teamAbbr, day, schedule)
      : false
    const startedIndex = findPlayerSlotIndex(daily, day, player.id)
    const started = startedIndex >= 0
    const startedSlot =
      startedIndex >= 0 ? daily[day]?.[startedIndex]?.slot : null
    const weeklyHome = rosterEntries.find(
      (entry) => entry.playerId === player.id && entry.slot !== "IL",
    )?.slot
    const label = dayOpponentLabel(player, day, schedule)
    const shortLabel = shortOpponentLabel(label)
    const sitStartHint = sitStartBadgesByPlayerId[player.id]
    const action = started ? "Sit" : "Start"
    const ariaLabel = startedSlot
      ? `${action} ${player.name} on ${formatMatchupDayLabel(day)} (${slotDisplayLabel(startedSlot)})`
      : `${action} ${player.name} on ${formatMatchupDayLabel(day)}`
    const lockedAriaLabel = isDropped
      ? `${player.name} dropped in streaming plan on ${formatMatchupDayLabel(day)}`
      : `${player.name} not on streaming plan on ${formatMatchupDayLabel(day)}`
    const irAriaLabel = `${player.name} on IR ${formatMatchupDayLabel(day)}`

    if (!hasGame) {
      return (
        <td className={dayColClassName(day, "px-1 py-1 text-center")} key={day}>
          <span
            aria-label={`${player.name} no game ${formatMatchupDayLabel(day)}`}
            className="inline-flex h-9 min-w-[3.75rem] items-center justify-center text-[var(--color-mute)]"
          >
            —
          </span>
        </td>
      )
    }

    return (
      <td className={dayColClassName(day, "px-1 py-1 text-center align-top")} key={day}>
        <div className="inline-flex flex-col items-center gap-0.5">
          <button
            aria-label={
              onIl
                ? irAriaLabel
                : isLocked
                  ? lockedAriaLabel
                  : sitStartHint
                    ? `${ariaLabel}. ${sitStartHint}`
                    : ariaLabel
            }
            aria-pressed={isLocked || onIl ? undefined : started}
            className={`inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-md px-1.5 text-[0.7rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed ${
              onIl
                ? "border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] text-[var(--color-mute)] opacity-80"
                : isLocked
                  ? "border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] text-[var(--color-mute)] opacity-70"
                  : started
                    ? "bg-[var(--color-ink)] text-white hover:opacity-90"
                    : "border border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-soft-cloud)]"
            }`}
            disabled={isLocked}
            onClick={() =>
              handleToggle(player, day, hasGame, isLocked, onIl)
            }
            type="button"
          >
            {onIl ? (
              <span className="mr-1 font-semibold tracking-wide">IR</span>
            ) : started && startedSlot && weeklyHome && startedSlot !== weeklyHome ? (
              <span className="mr-1 font-semibold tracking-wide">
                {slotDisplayLabel(startedSlot)}
              </span>
            ) : null}
            {shortLabel}
            {isB2b && !isLocked && !onIl ? (
              <span
                className="ml-1 text-[0.5625rem] font-semibold tracking-wide text-current opacity-70"
                title="B2B · ~75% expected"
              >
                B2B
              </span>
            ) : null}
          </button>
          {sitStartHint && !onIl ? (
            <span
              className="max-w-[4.75rem] text-center text-[0.5625rem] leading-tight font-medium text-[var(--color-ink)]"
              title={sitStartHint}
            >
              {sitStartHint}
            </span>
          ) : null}
        </div>
      </td>
    )
  }

  return (
    <section aria-label="Daily lineup" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Daily lineup</h2>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
            Slots stay put. Click a day to see that day’s seats; click a game cell to start or sit.
          </p>
        </div>
        <button
          className="text-[0.8125rem] font-medium text-[var(--color-mute)] underline-offset-2 transition-colors hover:text-[var(--color-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
          onClick={() => onReset()}
          type="button"
        >
          Reset to players with games
        </button>
      </div>

      {previewActive ? (
        <p className="mb-3 text-[0.8125rem] text-[var(--color-mute)]" role="status">
          {`Previewing ${previewSpotCount ? `${previewSpotCount}-spot` : "streaming"} plan — streamers overlay; start/sit roster or preview streamers as needed.`}
        </p>
      ) : null}

      {hint ? (
        <p className="mb-3 text-[0.8125rem] text-[var(--color-sale)]" role="status">
          {hint}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-hairline)]">
        <table
          className={`${MATCHUP_WEEK_TABLE_CLASS} text-left text-[0.8125rem] leading-snug`}
        >
          <colgroup>
            <col className={MATCHUP_WEEK_SLOT_COL_CLASS} />
            <col className={MATCHUP_WEEK_PLAYER_COL_CLASS} />
            {days.map((day) => (
              <col className={MATCHUP_WEEK_DAY_COL_CLASS} key={day} />
            ))}
          </colgroup>
          <thead className="bg-[var(--color-soft-cloud)] text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <tr>
              <th
                className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 bg-[var(--color-soft-cloud)] px-2 py-1.5 font-medium`}
                scope="col"
              >
                Slot
              </th>
              <th
                className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 bg-[var(--color-soft-cloud)] px-2.5 py-1.5 font-medium`}
                scope="col"
              >
                Player
              </th>
              {days.map((day) => (
                <th
                  className={dayColClassName(day, "px-1 py-1.5 text-center font-medium")}
                  key={day}
                  scope="col"
                >
                  <button
                    aria-label={`Highlight ${formatMatchupDayLabel(day)}`}
                    aria-pressed={activeFocusDay === day}
                    className={`rounded-full px-1 py-1 font-medium tracking-[0.08em] uppercase whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
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
                className="sticky left-0 z-10 bg-[var(--color-soft-cloud)] px-2.5 py-1.5 text-left font-medium normal-case tracking-normal"
                colSpan={2}
                scope="row"
              >
                Games
              </th>
              {days.map((day) => {
                const count = startedGameCountForDay(day)

                return (
                  <td
                    aria-label={`${count} games ${formatMatchupDayLabel(day)}`}
                    className={dayColClassName(
                      day,
                      "px-1 py-1.5 text-center font-medium tabular-nums normal-case tracking-normal",
                    )}
                    key={`${day}-games`}
                  >
                    {count}
                  </td>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {slotRows.map((row, rowIndex) => {
              const namePlayer = row.playerId
                ? playersById.get(row.playerId) ?? null
                : null
              const isPreview = Boolean(
                namePlayer && previewIds.has(namePlayer.id),
              )
              const onIl = row.slot === "IL"
              const droppedFrom = namePlayer
                ? droppedFromDateByPlayerId[namePlayer.id]
                : undefined
              const isPlanDropped = Boolean(
                droppedFrom && activeFocusDay >= droppedFrom,
              )

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
                    className={`${MATCHUP_WEEK_SLOT_COL_CLASS} sticky left-0 z-10 whitespace-nowrap bg-[var(--color-canvas)] px-2 py-1.5 font-semibold tracking-wide text-[var(--color-mute)]`}
                    scope="row"
                  >
                    {slotLabel(row.slot)}
                  </th>
                  <td
                    className={`${MATCHUP_WEEK_PLAYER_COL_CLASS} sticky left-12 z-10 overflow-hidden bg-[var(--color-canvas)] px-2.5 py-1.5 font-medium`}
                  >
                    {namePlayer ? (
                      <>
                        <span
                          className={
                            isPlanDropped
                              ? "text-[var(--color-mute)] line-through"
                              : undefined
                          }
                        >
                          {namePlayer.name}
                        </span>
                        {isPreview ? (
                          <span className="ml-1.5 rounded-full border border-dashed border-[var(--color-hairline)] px-1.5 py-0.5 text-[0.625rem] font-normal tracking-wide text-[var(--color-mute)] uppercase">
                            preview
                          </span>
                        ) : null}
                        <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                          {formatPlayerPositions(namePlayer)}
                        </span>
                        {namePlayer.teamAbbr ? (
                          <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                            {namePlayer.teamAbbr}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="font-normal text-[var(--color-mute)]">
                        —
                      </span>
                    )}
                  </td>
                  {days.map((day) =>
                    renderDayCell(namePlayer, day, onIl),
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
