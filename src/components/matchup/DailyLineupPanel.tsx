"use client"

import type { ChangeEvent } from "react"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import { dayOpponentLabel } from "@/lib/matchup/dailyLineups"
import type { ScheduleResponse, SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"

type DailyLineupPanelProps = {
  days: string[]
  selectedDay: string
  daily: DailyLineups
  rosterPlayers: SeasonPlayer[]
  schedule: ScheduleResponse
  onSelectDay: (day: string) => void
  onChangeSlot: (day: string, slotIndex: number, playerId: string | null) => void
  onReset: () => void
}

const formatDayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
}

export const DailyLineupPanel = ({
  days,
  selectedDay,
  daily,
  rosterPlayers,
  schedule,
  onSelectDay,
  onChangeSlot,
  onReset,
}: DailyLineupPanelProps) => {
  const entries = daily[selectedDay] ?? []
  const playersById = new Map(rosterPlayers.map((player) => [player.id, player]))

  const handleSlotChange = (
    slotIndex: number,
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = event.target.value
    onChangeSlot(selectedDay, slotIndex, value === "" ? null : value)
  }

  return (
    <section aria-label="Daily lineup" className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Daily lineup</h2>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
            Set who starts each day. The board above updates from these lineups.
          </p>
        </div>
        <button
          className="text-[0.8125rem] font-medium text-[var(--color-mute)] underline-offset-2 transition-colors hover:text-[var(--color-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)]"
          onClick={onReset}
          type="button"
        >
          Reset week to weekly lineup
        </button>
      </div>

      <div
        aria-label="Scoring period days"
        className="mb-4 flex flex-wrap gap-1.5"
        role="tablist"
      >
        {days.map((day) => {
          const selected = day === selectedDay

          return (
            <button
              aria-controls={`daily-lineup-${day}`}
              aria-selected={selected}
              className={`rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)] ${
                selected
                  ? "bg-[var(--color-ink)] font-medium text-white"
                  : "text-[var(--color-mute)] hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)]"
              }`}
              id={`day-tab-${day}`}
              key={day}
              onClick={() => onSelectDay(day)}
              role="tab"
              type="button"
            >
              {formatDayLabel(day)}
            </button>
          )
        })}
      </div>

      <div
        aria-labelledby={`day-tab-${selectedDay}`}
        className="overflow-x-auto rounded-2xl border border-[var(--color-hairline)]"
        id={`daily-lineup-${selectedDay}`}
        role="tabpanel"
      >
        <table className="w-full min-w-[28rem] border-collapse text-left text-[0.8125rem] leading-snug">
          <thead className="bg-[var(--color-soft-cloud)] text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <tr>
              <th className="px-2.5 py-1.5 font-medium" scope="col">
                Slot
              </th>
              <th className="px-2.5 py-1.5 font-medium" scope="col">
                Player
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry: SeasonRosterEntry, slotIndex) => (
              <tr className="border-t border-[var(--color-hairline)]" key={`${entry.slot}-${slotIndex}`}>
                <th className="whitespace-nowrap px-2.5 py-1 font-medium" scope="row">
                  {entry.slot}
                </th>
                <td className="px-2.5 py-1">
                  <select
                    aria-label={`${entry.slot} for ${selectedDay}`}
                    className="w-full max-w-md rounded border border-[var(--color-hairline)] bg-white px-2 py-0.5 text-[0.8125rem]"
                    onChange={(event) => handleSlotChange(slotIndex, event)}
                    value={entry.playerId ?? ""}
                  >
                    <option value="">Empty</option>
                    {rosterPlayers.map((player) => {
                      const label = dayOpponentLabel(player, selectedDay, schedule)

                      return (
                        <option key={player.id} value={player.id}>
                          {player.name}
                          {player.teamAbbr ? ` (${player.teamAbbr})` : ""} · {label}
                        </option>
                      )
                    })}
                  </select>
                  {entry.playerId ? (
                    <p className="mt-0.5 text-[0.7rem] text-[var(--color-mute)]">
                      {dayOpponentLabel(playersById.get(entry.playerId), selectedDay, schedule)}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
