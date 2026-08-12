import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { CategoryLevel } from "@/lib/season/analysis"

type CompactCategoryProfileProps = {
  levels: CategoryLevel[]
}

const categoryLabels: Record<CategoryId, string> = {
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

export const CompactCategoryProfile = ({
  levels,
}: CompactCategoryProfileProps) => {
  const levelsByCategory = new Map(
    levels.map((level) => [level.categoryId, level]),
  )

  return (
    <section aria-labelledby="category-profile-heading">
      <div className="mb-4">
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          League relative
        </p>
        <h2 className="mt-1 text-3xl font-semibold" id="category-profile-heading">
          Category profile
        </h2>
      </div>
      <div className="grid gap-x-6 gap-y-2.5 rounded-2xl border border-[var(--color-hairline)] p-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_CATEGORY_IDS.map((categoryId) => {
          const level = levelsByCategory.get(categoryId)
          const width = Math.min((level?.intensity ?? 0) * 50, 100)
          const isPositive = level?.kind === "positive"

          return (
            <div key={categoryId}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{categoryLabels[categoryId]}</span>
                <span className="tabular-nums text-[var(--color-mute)]">
                  {(level?.z ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px">
                <div className="flex h-1.5 justify-end bg-[var(--color-soft-cloud)]">
                  {!isPositive ? (
                    <span
                      className="bg-[var(--color-sale)]"
                      style={{ width: `${width}%` }}
                    />
                  ) : null}
                </div>
                <div className="h-1.5 bg-[var(--color-soft-cloud)]">
                  {isPositive ? (
                    <span
                      className="block h-full bg-[var(--color-success)]"
                      style={{ width: `${width}%` }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
