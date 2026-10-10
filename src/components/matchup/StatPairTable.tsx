import type { StatPairRow } from "@/lib/players/statPairCorrelation"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

type StatPairTableProps = {
  rows: StatPairRow[]
}

const pairLabel = (row: StatPairRow) =>
  `${CATEGORY_SHORT_LABELS[row.categoryA]} · ${CATEGORY_SHORT_LABELS[row.categoryB]}`

export const StatPairTable = ({ rows }: StatPairTableProps) => (
  <details className="text-sm text-[var(--color-ink)]">
    <summary aria-label="Stat pairs" className="cursor-pointer">
      Stat pairs
    </summary>
    {rows.length === 0 ? (
      <p className="mt-2 text-[var(--color-mute)]">No stat-pair sample yet</p>
    ) : (
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="text-left text-[var(--color-mute)]">
            <th className="py-1 pr-4 font-medium" scope="col">
              Pair
            </th>
            <th className="py-1 pr-4 font-medium" scope="col">
              r
            </th>
            <th className="py-1 pr-4 font-medium" scope="col">
              Penalty
            </th>
            <th className="py-1 font-medium" scope="col">
              Rows
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className="border-t border-[var(--color-hairline)]"
              key={`${row.categoryA}:${row.categoryB}`}
            >
              <th
                className="py-1 pr-4 text-left font-normal text-[var(--color-ink)]"
                scope="row"
              >
                {pairLabel(row)}
              </th>
              <td className="py-1 pr-4 tabular-nums">
                {row.measured ? row.r.toFixed(2) : "—"}
              </td>
              <td className="py-1 pr-4 tabular-nums">
                {row.measured ? row.penalty.toFixed(3) : "—"}
              </td>
              <td className="py-1 tabular-nums text-[var(--color-mute)]">
                {row.n}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </details>
)
