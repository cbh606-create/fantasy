"use client"

import { Fragment } from "react"
import type {
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

type PlayerRosterTableProps = {
  entries: SeasonRosterEntry[]
  isEditing: boolean
  onPlayerChange: (entryIndex: number, playerId: string | null) => void
  players: SeasonPlayer[]
}

const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`

const formatStat = (value: number) => value.toFixed(1)

const groupForEntry = (index: number) => {
  if (index < 10) return "Starters"
  if (index < 13) return "Bench"
  return "Injured list"
}

export const PlayerRosterTable = ({
  entries,
  isEditing,
  onPlayerChange,
  players,
}: PlayerRosterTableProps) => {
  const playersById = new Map(players.map((player) => [player.id, player]))

  return (
    <section aria-labelledby="roster-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
            Full roster
          </p>
          <h2 className="mt-1 text-3xl font-semibold" id="roster-heading">
            All players
          </h2>
        </div>
        <p className="text-sm text-[var(--color-mute)]">14 slots</p>
      </div>
      <div className="overflow-x-auto rounded-[2rem] border border-[var(--color-hairline)]">
        <table className="w-full min-w-[70rem] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-soft-cloud)] text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <tr>
              {["Slot", "Player", "FG%", "FGM/A", "FT%", "FTM/A", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS"].map((label) => (
                <th className="px-3 py-3 font-medium" key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const player = entry.playerId ? playersById.get(entry.playerId) : undefined
              const previousGroup = index > 0 ? groupForEntry(index - 1) : null
              const currentGroup = groupForEntry(index)

              return (
                <Fragment key={`${entry.slot}-${index}`}>
                  {currentGroup !== previousGroup ? (
                    <tr className="border-y border-[var(--color-hairline)] bg-[var(--color-canvas)]" key={`${currentGroup}-label`}>
                      <th className="px-3 py-2 text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase" colSpan={13} scope="rowgroup">
                        {currentGroup}
                      </th>
                    </tr>
                  ) : null}
                  <tr className="border-b border-[var(--color-hairline)] last:border-b-0">
                    <th className="whitespace-nowrap px-3 py-3 font-medium" scope="row">
                      {entry.slot}
                    </th>
                    <td className="min-w-52 px-3 py-3 font-medium">
                      {isEditing ? (
                        <select
                          aria-label={`${entry.slot} player`}
                          className="w-full rounded-lg border border-[var(--color-hairline)] bg-white px-2 py-1.5 text-sm"
                          onChange={(event) => onPlayerChange(index, event.target.value || null)}
                          value={entry.playerId ?? ""}
                        >
                          <option value="">Empty slot</option>
                          {players.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      ) : player ? player.name : <span className="text-[var(--color-mute)]">Empty</span>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatPercentage(player.projections.FG_PCT) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? `${formatStat(player.shooting.FGM)}/${formatStat(player.shooting.FGA)}` : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatPercentage(player.projections.FT_PCT) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? `${formatStat(player.shooting.FTM)}/${formatStat(player.shooting.FTA)}` : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.TPM) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.REB) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.AST) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.STL) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.BLK) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.TO) : "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{player ? formatStat(player.projections.PTS) : "—"}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
