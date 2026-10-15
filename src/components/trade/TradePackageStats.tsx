import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import {
  CATEGORY_SHORT_LABELS,
  fantasyCategoryDelta,
  formatCategoryStat,
  formatCategoryStatDelta,
} from "@/lib/season/formatCategoryStat"
import type { SeasonLeagueState } from "@/lib/season/types"
import { tradeStatRows, type TradeStatInput, type TradeStatSide } from "@/lib/trade/packageStats"

type TradePackageStatsProps = {
  state: SeasonLeagueState
  suggestion: TradeStatInput
  className?: string
}

const sideShade: Record<TradeStatSide, string> = {
  you: "bg-[color-mix(in_srgb,#1d4e89_14%,transparent)]",
  them: "bg-[color-mix(in_srgb,#9a3412_12%,transparent)]",
}

const formatNetValue = (value: number) => {
  const text = Math.abs(value).toFixed(3)
  if (value > 0) return `+${text}`
  if (value < 0) return `-${text}`
  return text
}

export const TradePackageStats = ({
  state,
  suggestion,
  className = "mt-8",
}: TradePackageStatsProps) => {
  const rows = tradeStatRows(state, suggestion)

  return (
    <section aria-label="Stats traded" className={className}>
      <h2 className="mb-3 text-lg font-semibold">Stats traded</h2>
      <div className="overflow-x-auto border-y border-[var(--color-hairline)]">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase">
              <th className="py-2 pr-3 font-medium" scope="col">Player</th>
              <th className="px-2 py-2 text-right font-medium" scope="col">Value</th>
              {ALL_CATEGORY_IDS.map((categoryId) => (
                <th className="px-2 py-2 text-right font-medium" key={categoryId} scope="col">
                  {CATEGORY_SHORT_LABELS[categoryId]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={`border-t border-[var(--color-hairline)] ${sideShade[row.side]} ${row.emphasis ? "font-semibold" : ""}`}
                data-side={row.side}
                key={row.id}
              >
                <th className="py-2 pr-3 font-medium" scope="row">{row.label}</th>
                <td className="px-2 py-2 text-right tabular-nums">
                  {row.value === null
                    ? ""
                    : row.signed
                      ? formatNetValue(row.value)
                      : row.value.toFixed(3)}
                </td>
                {ALL_CATEGORY_IDS.map((categoryId) => (
                  <td className="px-2 py-2 text-right tabular-nums" key={categoryId}>
                    {row.signed
                      ? formatCategoryStatDelta(
                        categoryId,
                        fantasyCategoryDelta(categoryId, row.values[categoryId]),
                      )
                      : formatCategoryStat(categoryId, row.values[categoryId])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
