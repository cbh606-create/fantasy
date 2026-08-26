"use client"

import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player } from "@/lib/domain/types"

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

type PlayerStatsPeekProps = {
  player: Player | null
}

export const PlayerStatsPeek = ({ player }: PlayerStatsPeekProps) => {
  return (
    <section
      aria-label="Player projections"
      className="mt-3 rounded-2xl border border-[var(--color-hairline)] bg-white px-4 py-3"
    >
      {player ? (
        <>
          <p className="text-sm font-semibold">
            {player.name}
            <span className="ml-1.5 font-normal text-[var(--color-mute)]">
              {player.teamAbbr ?? "—"}
            </span>
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs sm:grid-cols-5">
            {ALL_CATEGORY_IDS.map((categoryId) => (
              <div className="flex justify-between gap-1" key={categoryId}>
                <dt className="text-[var(--color-mute)]">
                  {CATEGORY_LABELS[categoryId]}
                </dt>
                <dd className="tabular-nums font-medium">
                  {formatProjection(categoryId, player.projections[categoryId])}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm text-[var(--color-mute)]">
          Hover a player to see projections
        </p>
      )}
    </section>
  )
}
