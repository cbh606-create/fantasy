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

const isRateCategory = (categoryId: CategoryId) =>
  categoryId === "FG_PCT" || categoryId === "FT_PCT"

const formatSeason = (categoryId: CategoryId, value: number) => {
  if (isRateCategory(categoryId)) return value.toFixed(3)
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const formatPerGame = (
  categoryId: CategoryId,
  seasonValue: number,
  projectedGames: number | undefined,
) => {
  if (isRateCategory(categoryId)) return seasonValue.toFixed(3)
  if (projectedGames == null || projectedGames <= 0) return "—"
  return (seasonValue / projectedGames).toFixed(1)
}

const GRID_COLS =
  "grid-cols-[7.5rem_2.75rem_repeat(9,minmax(3.25rem,1fr))] sm:grid-cols-[9rem_3rem_repeat(9,minmax(3.5rem,1fr))]"

type PlayerStatsPeekProps = {
  focusCategoryIds?: CategoryId[]
  player: Player | null
  puntCategoryIds?: CategoryId[]
}

export const PlayerStatsPeek = ({
  focusCategoryIds = [],
  player,
  puntCategoryIds = [],
}: PlayerStatsPeekProps) => {
  const gp = player?.projectedGames
  const punt = new Set(puntCategoryIds)
  const focus = new Set(focusCategoryIds)
  const headerBadge = (categoryId: CategoryId) => {
    if (punt.has(categoryId)) return "Punt"
    if (focus.has(categoryId)) return "Focus"
    return null
  }

  return (
    <section
      aria-label="Player projections"
      className="mt-3 rounded-2xl border border-[var(--color-hairline)] bg-white px-3 py-2.5 sm:px-4"
    >
      <div className="overflow-x-auto">
        <div className={`grid ${GRID_COLS} gap-x-1 gap-y-1 text-[0.8125rem]`}>
          <div className="min-w-0 truncate pr-2 text-[0.9375rem] font-semibold">
            {player ? (
              <>
                <span className="truncate">{player.name}</span>
                <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                  {player.teamAbbr ?? "—"}
                </span>
              </>
            ) : (
              <span className="font-normal text-[var(--color-mute)]">
                Hover a player to see projections
              </span>
            )}
          </div>
          <div className="text-center text-[0.7rem] font-medium tracking-wide text-[var(--color-mute)] uppercase">
            GP
          </div>
          {ALL_CATEGORY_IDS.map((categoryId) => {
            const label = CATEGORY_LABELS[categoryId]
            const badge = headerBadge(categoryId)

            return (
              <div
                aria-label={badge ? `${label} ${badge}` : label}
                className="text-center text-[0.7rem] font-medium tracking-wide text-[var(--color-mute)] uppercase"
                key={`label-${categoryId}`}
              >
                {label}
                {badge ? (
                  <span className="mt-0.5 block font-medium normal-case tracking-normal">
                    {badge}
                  </span>
                ) : null}
              </div>
            )
          })}

          <div className="pr-2 text-[var(--color-mute)]">Season</div>
          <div className="text-center tabular-nums font-medium">
            {gp != null && gp > 0 ? String(gp) : "—"}
          </div>
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <div
              className="text-center tabular-nums font-medium"
              key={`season-${categoryId}`}
            >
              {player
                ? formatSeason(categoryId, player.projections[categoryId])
                : "—"}
            </div>
          ))}

          <div className="pr-2 text-[var(--color-mute)]">Per game</div>
          <div className="text-center tabular-nums font-medium text-[var(--color-mute)]">
            —
          </div>
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <div
              className="text-center tabular-nums font-medium"
              key={`pg-${categoryId}`}
            >
              {player
                ? formatPerGame(
                    categoryId,
                    player.projections[categoryId],
                    gp,
                  )
                : "—"}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
