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
        <ul
          className={`overflow-y-auto ${
            compact ? "mt-2 max-h-[40rem] space-y-1" : "mt-4 max-h-[32rem] space-y-2"
          }`}
        >
          {availablePlayers.map((player) => (
            <li
              className={`group relative bg-white ${
                compact ? "rounded-xl px-2 py-1.5" : "rounded-2xl p-3"
              }`}
              key={player.id}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`truncate font-medium ${compact ? "text-xs" : ""}`}>
                    {player.name}
                  </p>
                  <p
                    className={`text-[var(--color-mute)] ${
                      compact ? "text-[0.65rem]" : "mt-1 text-xs"
                    }`}
                  >
                    {player.positions.join("/")} · ADP {player.adp}
                  </p>
                </div>
                <Button
                  aria-label={`Mark ${player.name} picked`}
                  className={
                    compact ? "h-7 shrink-0 px-2.5 text-[0.7rem]" : "h-9 shrink-0 px-4 text-sm"
                  }
                  disabled={disabled}
                  onClick={() => onMarkPicked(player.id)}
                  variant="secondary"
                >
                  Pick
                </Button>
              </div>
              <div
                className="pointer-events-none absolute left-full top-0 z-20 ml-2 hidden w-52 rounded-xl border border-[var(--color-hairline)] bg-white p-3 shadow-lg group-hover:block group-focus-within:block"
                role="tooltip"
              >
                <p className="text-xs font-semibold">{player.name}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[0.65rem]">
                  {ALL_CATEGORY_IDS.map((categoryId) => (
                    <div className="flex justify-between gap-2" key={categoryId}>
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
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-[var(--color-mute)] ${compact ? "mt-3 text-xs" : "mt-5 text-sm"}`}>
          No available players match your search.
        </p>
      )}
    </aside>
  )
}
