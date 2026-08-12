"use client"

import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { SearchPill } from "@/components/ui/SearchPill"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"

type PlayerPoolProps = {
  compact?: boolean
  disabled?: boolean
  onMarkPicked: (playerId: string) => void
  pickedPlayerIds: string[]
  players: Player[]
}

const CATEGORY_LABELS: Record<CategoryId, string> = {
  FG_PCT: "FG%",
  FT_PCT: "FT%",
  TPM: "3PM",
  REB: "REB",
  AST: "AST",
  STL: "STL",
  BLK: "BLK",
  TO: "TO",
  PTS: "PTS",
}

const formatProjection = (categoryId: CategoryId, value: number) => {
  if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
    return value.toFixed(3)
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const formatAdp = (adp: number) =>
  Number.isInteger(adp) ? String(adp) : adp.toFixed(1)

export const PlayerPool = ({
  compact = false,
  disabled = false,
  onMarkPicked,
  pickedPlayerIds,
  players,
}: PlayerPoolProps) => {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const availablePlayers = players
    .filter((player) => !pickedPlayerIds.includes(player.id))
    .filter((player) =>
      normalizedQuery
        ? player.name.toLowerCase().includes(normalizedQuery)
        : true,
    )
    .slice(0, compact ? 48 : 20)

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
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[0.6rem] tracking-wide text-[var(--color-mute)] uppercase">
                  <th className="sticky top-0 z-10 bg-[var(--color-soft-cloud)] py-1 pr-1 font-medium">
                    Player
                  </th>
                  <th className="sticky top-0 z-10 bg-[var(--color-soft-cloud)] px-1 py-1 font-medium">
                    Pos
                  </th>
                  <th className="sticky top-0 z-10 bg-[var(--color-soft-cloud)] px-1 py-1 text-right font-medium">
                    ADP
                  </th>
                  <th className="sticky top-0 z-10 bg-[var(--color-soft-cloud)] py-1 pl-1 font-medium">
                    <span className="sr-only">Pick</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {availablePlayers.map((player) => (
                  <tr
                    className="group relative border-t border-[var(--color-hairline)]/60"
                    key={player.id}
                  >
                    <td className="max-w-[7.5rem] py-1.5 pr-1 align-top">
                      <p className="break-words text-xs font-medium leading-tight">
                        {player.name}
                      </p>
                      <div
                        className="pointer-events-none absolute left-full top-0 z-20 ml-2 hidden w-52 rounded-xl border border-[var(--color-hairline)] bg-white p-3 shadow-lg group-hover:block group-focus-within:block"
                        role="tooltip"
                      >
                        <p className="text-xs font-semibold">{player.name}</p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[0.65rem]">
                          {ALL_CATEGORY_IDS.map((categoryId) => (
                            <div
                              className="flex justify-between gap-2"
                              key={categoryId}
                            >
                              <dt className="text-[var(--color-mute)]">
                                {CATEGORY_LABELS[categoryId]}
                              </dt>
                              <dd className="tabular-nums font-medium">
                                {formatProjection(
                                  categoryId,
                                  player.projections[categoryId],
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
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
                    <div className="min-w-0">
                      <p className="break-words font-medium leading-tight">
                        {player.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-mute)]">
                        {player.positions.join("/")} · ADP {formatAdp(player.adp)}
                      </p>
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
