"use client"

import { Fragment } from "react"
import { eligibleForSlot } from "@/lib/matchup/eligibility"
import {
  formatPlayerPositions,
  slotDisplayLabel,
} from "@/lib/season/slotLabels"
import type {
  SeasonPlayer,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

type PlayerRosterTableProps = {
  entries: SeasonRosterEntry[]
  isEditing: boolean
  onPlayerChange: (entryIndex: number, playerId: string | null) => void
  players: SeasonPlayer[]
  title?: string
  subtitle?: string
  compact?: boolean
}

const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`

const formatStat = (value: number) => value.toFixed(1)

const groupForSlot = (slot: SeasonSlot) => {
  if (slot === "BE") return "Bench"
  if (slot === "IL") return "IR"
  return "Starters"
}

const optionLabel = (player: SeasonPlayer) => {
  const parts = [player.name, formatPlayerPositions(player)]
  if (player.teamAbbr) parts.push(player.teamAbbr)
  return parts.join(" · ")
}

export const PlayerRosterTable = ({
  entries,
  isEditing,
  onPlayerChange,
  players,
  title = "All players",
  subtitle = "Full roster",
  compact = false,
}: PlayerRosterTableProps) => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const headingId = compact ? "matchup-weekly-roster-heading" : "roster-heading"

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
            {subtitle}
          </p>
          <h2
            className={
              compact
                ? "mt-1 text-xl font-semibold"
                : "mt-1 text-3xl font-semibold"
            }
            id={headingId}
          >
            {title}
          </h2>
        </div>
        <p className="text-sm text-[var(--color-mute)]">
          {entries.length} slots · PG–C, G, F, UTIL×3, BE×3, IR
        </p>
      </div>
      <div className="overflow-x-auto rounded-[2rem] border border-[var(--color-hairline)]">
        <table className="w-full min-w-[74rem] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-soft-cloud)] text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <tr>
              {[
                "Slot",
                "Player",
                "Pos",
                "FG%",
                "FGM/A",
                "FT%",
                "FTM/A",
                "3PM",
                "REB",
                "AST",
                "STL",
                "BLK",
                "TO",
                "PTS",
              ].map((label) => (
                <th className="px-3 py-3 font-medium" key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const player = entry.playerId
                ? playersById.get(entry.playerId)
                : undefined
              const previousGroup =
                index > 0 ? groupForSlot(entries[index - 1].slot) : null
              const currentGroup = groupForSlot(entry.slot)
              const slotLabel = slotDisplayLabel(entry.slot)

              return (
                <Fragment key={`${entry.slot}-${index}`}>
                  {currentGroup !== previousGroup ? (
                    <tr
                      className="border-y border-[var(--color-hairline)] bg-[var(--color-canvas)]"
                      key={`${currentGroup}-label`}
                    >
                      <th
                        className="px-3 py-2 text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase"
                        colSpan={14}
                        scope="rowgroup"
                      >
                        {currentGroup}
                      </th>
                    </tr>
                  ) : null}
                  <tr className="border-b border-[var(--color-hairline)] last:border-b-0">
                    <th className="whitespace-nowrap px-3 py-3 font-medium" scope="row">
                      {slotLabel}
                    </th>
                    <td className="min-w-52 px-3 py-3 font-medium">
                      {isEditing ? (
                        <select
                          aria-label={`${slotLabel} player`}
                          className="w-full rounded-lg border border-[var(--color-hairline)] bg-white px-2 py-1.5 text-sm"
                          onChange={(event) =>
                            onPlayerChange(index, event.target.value || null)
                          }
                          value={entry.playerId ?? ""}
                        >
                          <option value="">Empty slot</option>
                          {players.map((option) => {
                            const eligible = eligibleForSlot(option, entry.slot)
                            return (
                              <option
                                disabled={!eligible}
                                key={option.id}
                                value={option.id}
                              >
                                {optionLabel(option)}
                                {eligible ? "" : " (ineligible)"}
                              </option>
                            )
                          })}
                        </select>
                      ) : player ? (
                        <>
                          <span>{player.name}</span>
                          <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                            {formatPlayerPositions(player)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--color-mute)]">Empty</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[var(--color-mute)]">
                      {formatPlayerPositions(player)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatPercentage(player.projections.FG_PCT) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player
                        ? `${formatStat(player.shooting.FGM)}/${formatStat(player.shooting.FGA)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatPercentage(player.projections.FT_PCT) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player
                        ? `${formatStat(player.shooting.FTM)}/${formatStat(player.shooting.FTA)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.TPM) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.REB) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.AST) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.STL) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.BLK) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.TO) : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {player ? formatStat(player.projections.PTS) : "—"}
                    </td>
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
