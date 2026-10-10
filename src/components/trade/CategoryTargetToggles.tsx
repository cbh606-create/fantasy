import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

type CategoryTargetTogglesProps = {
  selectedIds: CategoryId[]
  onToggle: (categoryId: CategoryId) => void
}

export const CategoryTargetToggles = ({
  selectedIds,
  onToggle,
}: CategoryTargetTogglesProps) => (
  <section className="mt-8">
    <h2 className="text-lg font-semibold">Categories to add</h2>
    <div className="mt-3 flex flex-wrap gap-2">
      {ALL_CATEGORY_IDS.map((categoryId) => {
        const selected = selectedIds.includes(categoryId)

        return (
          <button
            aria-pressed={selected}
            className={
              selected
                ? "rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-[var(--color-hairline)] bg-white px-3 py-1.5 text-sm font-medium"
            }
            key={categoryId}
            onClick={() => onToggle(categoryId)}
            type="button"
          >
            {CATEGORY_SHORT_LABELS[categoryId]}
          </button>
        )
      })}
    </div>
  </section>
)
