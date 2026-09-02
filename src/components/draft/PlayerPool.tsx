"use client"

import { useState } from "react"
import { PlayerAvatar } from "@/components/draft/PlayerAvatar"
import { Button } from "@/components/ui/Button"
import { SearchPill } from "@/components/ui/SearchPill"
import type { Player } from "@/lib/domain/types"
import {
  DEFAULT_ADP_SOURCE,
  formatAdpReferenceLine,
  type AdpSourceId,
} from "@/lib/players/adpSources"

type PlayerPoolProps = {
  adpSource?: AdpSourceId
  compact?: boolean
  disabled?: boolean
  onHoverPlayerId?: (playerId: string | null) => void
  onMarkPicked: (playerId: string) => void
  pickedPlayerIds: string[]
  players: Player[]
}

type SortKey = "name" | "pos" | "adp"
type SortDirection = "asc" | "desc"

const formatAdp = (adp: number) =>
  Number.isInteger(adp) ? String(adp) : adp.toFixed(1)

const comparePlayers = (
  left: Player,
  right: Player,
  sortKey: SortKey,
  sortDirection: SortDirection,
) => {
  const direction = sortDirection === "asc" ? 1 : -1

  if (sortKey === "adp") {
    return (left.adp - right.adp) * direction
  }

  if (sortKey === "pos") {
    return (
      left.positions.join("/").localeCompare(right.positions.join("/")) *
      direction
    )
  }

  return left.name.localeCompare(right.name) * direction
}

const sortIndicator = (
  activeKey: SortKey,
  columnKey: SortKey,
  direction: SortDirection,
) => {
  if (activeKey !== columnKey) return ""
  return direction === "asc" ? " ↑" : " ↓"
}

type SortHeaderProps = {
  columnKey: SortKey
  label: string
  onSort: (key: SortKey) => void
  sortDirection: SortDirection
  sortKey: SortKey
  className?: string
}

const SortHeader = ({
  columnKey,
  label,
  onSort,
  sortDirection,
  sortKey,
  className = "",
}: SortHeaderProps) => {
  const active = sortKey === columnKey
  const ariaSort = active
    ? sortDirection === "asc"
      ? "ascending"
      : "descending"
    : "none"

  return (
    <th
      aria-sort={ariaSort}
      className={`sticky top-0 z-10 bg-[var(--color-soft-cloud)] py-1 font-medium ${className}`}
      scope="col"
    >
      <button
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-0.5 text-left uppercase tracking-wide ${
          active ? "text-[var(--color-ink)]" : "text-[var(--color-mute)]"
        }`}
        onClick={() => onSort(columnKey)}
        type="button"
      >
        {label}
        <span aria-hidden="true">{sortIndicator(sortKey, columnKey, sortDirection)}</span>
      </button>
    </th>
  )
}

export const PlayerPool = ({
  adpSource = DEFAULT_ADP_SOURCE,
  compact = false,
  disabled = false,
  onHoverPlayerId,
  onMarkPicked,
  pickedPlayerIds,
  players,
}: PlayerPoolProps) => {
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("adp")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const normalizedQuery = query.trim().toLowerCase()
  const limit = compact ? 48 : 20
  const pickedIdSet = new Set(pickedPlayerIds)

  const handleSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(nextKey)
    setSortDirection("asc")
  }

  const availablePlayers = players
    .filter((player) => !pickedIdSet.has(player.id))
    .filter((player) =>
      normalizedQuery
        ? player.name.toLowerCase().includes(normalizedQuery)
        : true,
    )
    .slice()
    .sort((left, right) => comparePlayers(left, right, sortKey, sortDirection))
    .slice(0, limit)

  return (
    <aside
      className={`bg-[var(--color-soft-cloud)] ${
        compact ? "rounded-2xl p-3" : "rounded-[2rem] p-5"
      }`}
    >
      <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
        {compact ? "Available" : "Manual update"}
      </p>
      <h2 className={`font-semibold ${compact ? "mt-1 text-lg" : "mt-2 text-2xl"}`}>
        Player pool
      </h2>
      <SearchPill
        aria-label="Search players"
        className={`bg-white ${compact ? "mt-3 h-9 text-sm" : "mt-5"}`}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search available players"
        value={query}
      />
      {availablePlayers.length ? (
        <div
          className={`overflow-y-auto ${
            compact ? "mt-2 max-h-[40rem]" : "mt-4 max-h-[32rem]"
          }`}
        >
          {compact ? (
            <table className="w-full border-collapse text-left text-[0.6rem]">
              <thead>
                <tr>
                  <SortHeader
                    className="pr-1"
                    columnKey="name"
                    label="Player"
                    onSort={handleSort}
                    sortDirection={sortDirection}
                    sortKey={sortKey}
                  />
                  <SortHeader
                    className="px-1"
                    columnKey="pos"
                    label="Pos"
                    onSort={handleSort}
                    sortDirection={sortDirection}
                    sortKey={sortKey}
                  />
                  <SortHeader
                    className="px-1 text-right"
                    columnKey="adp"
                    label="ADP"
                    onSort={handleSort}
                    sortDirection={sortDirection}
                    sortKey={sortKey}
                  />
                  <th className="sticky top-0 z-10 bg-[var(--color-soft-cloud)] py-1 pl-1 font-medium">
                    <span className="sr-only">Pick</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {availablePlayers.map((player) => (
                  <tr
                    className="border-t border-[var(--color-hairline)]/60"
                    key={player.id}
                    onBlur={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      ) {
                        onHoverPlayerId?.(null)
                      }
                    }}
                    onFocus={() => onHoverPlayerId?.(player.id)}
                    onMouseEnter={() => onHoverPlayerId?.(player.id)}
                    onMouseLeave={() => onHoverPlayerId?.(null)}
                  >
                    <td className="max-w-[7.5rem] py-1.5 pr-1 align-top">
                      <div className="flex items-start gap-1.5">
                        <PlayerAvatar player={player} size="sm" />
                        <div className="min-w-0">
                          <p className="break-words text-xs font-medium leading-tight">
                            {player.name}
                            <span className="ml-1 font-normal text-[var(--color-mute)]">
                              {player.teamAbbr ?? "—"}
                            </span>
                          </p>
                          <p className="mt-0.5 break-words text-[0.65rem] leading-tight text-[var(--color-mute)]">
                            {formatAdpReferenceLine(player, adpSource)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 align-top text-[0.65rem] text-[var(--color-mute)]">
                      {player.positions.join("/")}
                    </td>
                    <td className="px-1 py-1.5 text-right align-top text-[0.65rem] tabular-nums font-medium">
                      {formatAdp(player.adp)}
                    </td>
                    <td className="py-1.5 pl-1 align-top">
                      <Button
                        aria-label={`Mark ${player.name} picked`}
                        className="h-7 shrink-0 px-2 text-[0.7rem]"
                        disabled={disabled}
                        onClick={() => onMarkPicked(player.id)}
                        variant="secondary"
                      >
                        Pick
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ul className="space-y-2">
              {availablePlayers.map((player) => (
                <li className="rounded-2xl bg-white p-3" key={player.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <PlayerAvatar player={player} size="sm" />
                      <div className="min-w-0">
                        <p className="break-words font-medium leading-tight">
                          {player.name}
                          <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                            {player.teamAbbr ?? "—"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-mute)]">
                          {player.positions.join("/")} ·{" "}
                          {formatAdpReferenceLine(player, adpSource)}
                        </p>
                      </div>
                    </div>
                    <Button
                      aria-label={`Mark ${player.name} picked`}
                      className="h-9 shrink-0 px-4 text-sm"
                      disabled={disabled}
                      onClick={() => onMarkPicked(player.id)}
                      variant="secondary"
                    >
                      Pick
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className={`text-[var(--color-mute)] ${compact ? "mt-3 text-xs" : "mt-5 text-sm"}`}>
          No available players match your search.
        </p>
      )}
    </aside>
  )
}
