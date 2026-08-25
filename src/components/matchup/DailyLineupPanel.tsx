"use client"

import { useState } from "react"
import type {
  DailyLineups,
  TogglePlayerDayResult,
} from "@/lib/matchup/dailyLineups"
import {
  dayOpponentLabel,
  findPlayerSlotIndex,
} from "@/lib/matchup/dailyLineups"
import {
  gameWeightForTeamDate,
  isB2bSecondNight,
} from "@/lib/matchup/games"
import { formatPlayerPositions, slotDisplayLabel } from "@/lib/season/slotLabels"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

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
}

const toDateSet = (
  dates?: ReadonlySet<string> | string[],
): ReadonlySet<string> => (dates instanceof Set ? dates : new Set(dates ?? []))

const toIdSet = (ids?: Set<string> | string[]) =>
  ids instanceof Set ? ids : new Set(ids ?? [])

const formatDayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
}

const shortOpponentLabel = (label: string) => {
  if (label === "no game") return "—"
  return label.replace(/^vs\s+/i, "v ").replace(/\s+/g, " ")
}

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
}: DailyLineupPanelProps) => {
  const [hint, setHint] = useState("")
  const previewIds = toIdSet(previewPlayerIds)
  const rowPlayers = [...rosterPlayers]
  const seenIds = new Set(rosterPlayers.map((player) => player.id))
  for (const extra of extraPlayers ?? []) {
    if (seenIds.has(extra.id)) continue
    rowPlayers.push(extra)
    seenIds.add(extra.id)
  }

  const handleToggle = (
    player: SeasonPlayer,
    day: string,
    hasGame: boolean,
    locked: boolean,
  ) => {
    if (locked || !hasGame) return

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
    <section aria-label="Daily lineup" className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Daily lineup</h2>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
            Daily league: click a game box to start or sit anyone on your roster
            (including bench). The board above updates from these lineups.
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
        <table className="w-full min-w-[36rem] border-collapse text-left text-[0.8125rem] leading-snug">
          <thead className="bg-[var(--color-soft-cloud)] text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--color-soft-cloud)] px-2.5 py-1.5 font-medium" scope="col">
                Player
              </th>
              {days.map((day) => (
                <th
                  className="min-w-[4.5rem] px-1 py-1.5 text-center font-medium"
                  key={day}
                  scope="col"
                >
                  {formatDayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowPlayers.map((player) => {
              const isPreview = previewIds.has(player.id)
              const droppedFrom = droppedFromDateByPlayerId[player.id]
              const ownedDates = isPreview
                ? toDateSet(streamerOwnedDatesByPlayerId[player.id])
                : null
              const isPlanDropped = Boolean(droppedFrom)

              return (
                <tr
                  className={
                    isPreview
                      ? "border-t border-dashed border-[var(--color-hairline)]"
                      : "border-t border-[var(--color-hairline)]"
                  }
                  key={player.id}
                >
                  <th
                    className="sticky left-0 z-10 whitespace-nowrap bg-[var(--color-canvas)] px-2.5 py-1.5 font-medium"
                    scope="row"
                  >
                    <span
                      className={
                        isPlanDropped
                          ? "text-[var(--color-mute)] line-through"
                          : undefined
                      }
                    >
                      {player.name}
                    </span>
                    {isPreview ? (
                      <span className="ml-1.5 rounded-full border border-dashed border-[var(--color-hairline)] px-1.5 py-0.5 text-[0.625rem] font-normal tracking-wide text-[var(--color-mute)] uppercase">
                        preview
                      </span>
                    ) : null}
                    <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                      {formatPlayerPositions(player)}
                    </span>
                    {player.teamAbbr ? (
                      <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                        {player.teamAbbr}
                      </span>
                    ) : null}
                  </th>
                  {days.map((day) => {
                    const isDropped = Boolean(
                      droppedFrom && day >= droppedFrom,
                    )
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
                    const startedIndex = findPlayerSlotIndex(
                      daily,
                      day,
                      player.id,
                    )
                    const started = startedIndex >= 0
                    const startedSlot =
                      startedIndex >= 0
                        ? daily[day]?.[startedIndex]?.slot
                        : null
                    const label = dayOpponentLabel(player, day, schedule)
                    const shortLabel = shortOpponentLabel(label)
                    const action = started ? "Sit" : "Start"
                    const ariaLabel = startedSlot
                      ? `${action} ${player.name} on ${formatDayLabel(day)} (${slotDisplayLabel(startedSlot)})`
                      : `${action} ${player.name} on ${formatDayLabel(day)}`
                    const lockedAriaLabel = isDropped
                      ? `${player.name} dropped in streaming plan on ${formatDayLabel(day)}`
                      : `${player.name} not on streaming plan on ${formatDayLabel(day)}`

                    if (!hasGame) {
                      return (
                        <td className="px-1 py-1 text-center" key={day}>
                          <span
                            aria-label={`${player.name} no game ${formatDayLabel(day)}`}
                            className="inline-flex h-9 min-w-[3.75rem] items-center justify-center text-[var(--color-mute)]"
                          >
                            —
                          </span>
                        </td>
                      )
                    }

                    return (
                      <td className="px-1 py-1 text-center" key={day}>
                        <button
                          aria-label={isLocked ? lockedAriaLabel : ariaLabel}
                          aria-pressed={isLocked ? undefined : started}
                          className={`inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-md px-1.5 text-[0.7rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed ${
                            isLocked
                              ? "border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] text-[var(--color-mute)] opacity-70"
                              : started
                                ? "bg-[var(--color-ink)] text-white hover:opacity-90"
                                : "border border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-soft-cloud)]"
                          }`}
                          disabled={isLocked}
                          onClick={() =>
                            handleToggle(player, day, hasGame, isLocked)
                          }
                          type="button"
                        >
                          {startedSlot && !isLocked ? (
                            <span className="mr-1 font-semibold tracking-wide">
                              {slotDisplayLabel(startedSlot)}
                            </span>
                          ) : null}
                          {shortLabel}
                          {isB2b && !isLocked ? (
                            <span
                              className="ml-1 text-[0.5625rem] font-semibold tracking-wide text-current opacity-70"
                              title="B2B · ~75% expected"
                            >
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
          </tbody>
        </table>
      </div>
    </section>
  )
}
