"use client"

import type { ScheduleMatchup } from "@/lib/season/types"
import type { PlayerScheduleRow } from "@/lib/season/schedule"

type PlayerSchedulePanelProps = {
  matchup: ScheduleMatchup
  rows: PlayerScheduleRow[]
}

const formatDayHeader = (isoDate: string) => {
  const date = new Date(`${isoDate}T12:00:00`)
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" })
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${weekday} ${month}/${day}`
}

export const PlayerSchedulePanel = ({
  matchup,
  rows,
}: PlayerSchedulePanelProps) => (
  <section aria-labelledby="player-schedule-heading">
    <div className="mb-4">
      <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
        Matchup · {matchup.startDate} – {matchup.endDate}
      </p>
      <h2 className="mt-1 text-3xl font-semibold" id="player-schedule-heading">
        Player schedule
      </h2>
    </div>
    <div className="overflow-x-auto rounded-[2rem] border border-[var(--color-hairline)]">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead className="bg-[var(--color-soft-cloud)]">
          <tr>
            <th className="px-4 py-3 text-left text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase" scope="col">
              Player
            </th>
            <th className="px-3 py-3 text-center text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase" scope="col">
              Games
            </th>
            {matchup.days.map((day) => (
              <th
                className="px-2 py-3 text-center text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase"
                key={day}
                scope="col"
              >
                {formatDayHeader(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-[var(--color-hairline)]" key={`${row.slot}-${row.playerId ?? "empty"}`}>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium" scope="row">
                <span className="text-[var(--color-mute)]">{row.slot}</span>
                {" · "}
                {row.name}
                {row.teamUnknown ? (
                  <span className="ml-2 text-xs font-normal text-[var(--color-mute)]">team unknown</span>
                ) : null}
              </th>
              <td className="px-3 py-3 text-center tabular-nums font-semibold">
                {row.games === null ? "—" : row.games}
              </td>
              {matchup.days.map((day) => {
                const labels = row.cells[day] ?? []
                return (
                  <td className="px-2 py-3 text-center text-xs" key={day}>
                    {labels.length ? (
                      <span className="flex flex-col gap-0.5">
                        {labels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)
