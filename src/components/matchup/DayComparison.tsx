import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { DayComparisonRow } from "@/lib/matchup/morningCheck"
import {
  CATEGORY_SHORT_LABELS,
  formatCategoryStat,
} from "@/lib/season/formatCategoryStat"

type DayComparisonProps = {
  rows: DayComparisonRow[]
}

export const DayComparison = ({ rows }: DayComparisonProps) => {
  if (rows.length === 0) return null

  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <section
          aria-label={`Day comparison ${row.date}`}
          className="overflow-x-auto rounded-3xl bg-[var(--color-soft-cloud)] px-4 py-3"
          key={row.date}
        >
          <h2 className="text-sm font-medium text-[var(--color-ink)]">{row.date}</h2>
          <table className="mt-2 w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="text-[0.75rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
                <th className="px-1.5 py-1 text-left font-medium" scope="col">
                  <span className="sr-only">Team</span>
                </th>
                {ALL_CATEGORY_IDS.map((categoryId) => (
                  <th
                    className="px-1.5 py-1 text-center font-medium"
                    key={categoryId}
                    scope="col"
                  >
                    {CATEGORY_SHORT_LABELS[categoryId]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th
                  className="px-1.5 py-1 text-left text-[0.8125rem] font-medium text-[var(--color-mute)] uppercase"
                  scope="row"
                >
                  You
                </th>
                {ALL_CATEGORY_IDS.map((categoryId) => (
                  <td className="px-1.5 py-1 text-center" key={categoryId}>
                    <p className="text-[0.75rem] text-[var(--color-mute)] tabular-nums">
                      {formatCategoryStat(categoryId, row.youProjection[categoryId])}
                    </p>
                    <p className="tabular-nums text-[var(--color-ink)]">
                      {formatCategoryStat(categoryId, row.youActual[categoryId])}
                    </p>
                  </td>
                ))}
              </tr>
              <tr>
                <th
                  className="px-1.5 py-1 text-left text-[0.8125rem] font-medium text-[var(--color-mute)] uppercase"
                  scope="row"
                >
                  Opp
                </th>
                {ALL_CATEGORY_IDS.map((categoryId) => (
                  <td className="px-1.5 py-1 text-center" key={categoryId}>
                    <p className="text-[0.75rem] text-[var(--color-mute)] tabular-nums">
                      {formatCategoryStat(categoryId, row.oppProjection[categoryId])}
                    </p>
                    <p className="tabular-nums text-[var(--color-ink)]">
                      {formatCategoryStat(categoryId, row.oppActual[categoryId])}
                    </p>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
