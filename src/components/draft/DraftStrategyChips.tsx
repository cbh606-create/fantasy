"use client"

import { Chip } from "@/components/ui/Chip"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"

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

type Strategy = "punt" | "focus"

type DraftStrategyChipsProps = {
  focusCategoryIds: CategoryId[]
  onStrategyChange: (next: {
    puntCategoryIds: CategoryId[]
    focusCategoryIds: CategoryId[]
  }) => void
  puntCategoryIds: CategoryId[]
}

export const DraftStrategyChips = ({
  focusCategoryIds,
  onStrategyChange,
  puntCategoryIds,
}: DraftStrategyChipsProps) => {
  const handleToggle = (strategy: Strategy, categoryId: CategoryId) => {
    let punt = [...puntCategoryIds]
    let focus = [...focusCategoryIds]

    if (strategy === "punt") {
      punt = punt.includes(categoryId)
        ? punt.filter((id) => id !== categoryId)
        : [...punt, categoryId]
      focus = focus.filter((id) => id !== categoryId)
    } else {
      focus = focus.includes(categoryId)
        ? focus.filter((id) => id !== categoryId)
        : [...focus, categoryId]
      punt = punt.filter((id) => id !== categoryId)
    }

    onStrategyChange({ puntCategoryIds: punt, focusCategoryIds: focus })
  }

  return (
    <div className="mb-4 space-y-4">
      {(["punt", "focus"] as const).map((strategy) => {
        const selectedIds =
          strategy === "punt" ? puntCategoryIds : focusCategoryIds
        const rowLabel = strategy === "punt" ? "Punt" : "Focus"

        return (
          <div key={strategy}>
            <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
              {rowLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_CATEGORY_IDS.map((categoryId) => {
                const label = CATEGORY_LABELS[categoryId]

                return (
                  <Chip
                    aria-label={`${rowLabel} ${label}`}
                    key={categoryId}
                    onClick={() => handleToggle(strategy, categoryId)}
                    variant={
                      selectedIds.includes(categoryId) ? "active" : "default"
                    }
                  >
                    {label}
                  </Chip>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
