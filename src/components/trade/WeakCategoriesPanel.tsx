import type { CategoryId } from "@/lib/domain/types"

type WeakCategoriesPanelProps = {
  needs: CategoryId[]
  surplus: CategoryId[]
}

const CategoryPills = ({ categories }: { categories: CategoryId[] }) => {
  if (!categories.length) {
    return <span className="text-[var(--color-mute)]">None identified</span>
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {categories.map((categoryId) => (
        <span
          className="rounded-full border border-[var(--color-hairline)] bg-white px-2.5 py-1 font-medium"
          key={categoryId}
        >
          {categoryId}
        </span>
      ))}
    </span>
  )
}

export const WeakCategoriesPanel = ({
  needs,
  surplus,
}: WeakCategoriesPanelProps) => (
  <section className="rounded-3xl bg-[var(--color-soft-cloud)] p-5">
    <h2 className="text-lg font-semibold">Weak categories</h2>
    <div className="mt-4 grid gap-4 text-[0.8125rem] sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
          Improve
        </p>
        <CategoryPills categories={needs} />
      </div>
      <div>
        <p className="mb-2 text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
          Can trade
        </p>
        <CategoryPills categories={surplus} />
      </div>
    </div>
  </section>
)
