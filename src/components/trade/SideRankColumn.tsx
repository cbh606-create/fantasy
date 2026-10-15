import { RankNonagon } from "@/components/trade/RankNonagon"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import { formatTotal } from "@/lib/trade/offerCopy"
import type { SideRankReport } from "@/lib/trade/simulateTrade"

type SideRankColumnProps = {
  title: string
  report: SideRankReport
  teamCount: number
}

const rankText = (rankBefore: number, rankAfter: number) =>
  `#${rankBefore} → #${rankAfter}`

const shadeFor = (report: SideRankReport) => {
  if (report.rankSumAfter < report.rankSumBefore) return "gain"
  if (report.rankSumAfter > report.rankSumBefore) return "loss"
  return "even"
}

const columnShade = {
  gain: "bg-[color-mix(in_srgb,var(--color-success)_22%,transparent)]",
  loss: "bg-[color-mix(in_srgb,var(--color-sale)_16%,transparent)]",
  even: "",
} as const

export const SideRankColumn = ({ title, report, teamCount }: SideRankColumnProps) => {
  const shade = shadeFor(report)

  return (
    <section aria-label={title} className={`flex flex-col gap-2 rounded-lg p-3 ${columnShade[shade]}`} data-shade={shade}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p>
        {`Overall ${rankText(report.overallBefore, report.overallAfter)} (rank sum ${report.rankSumBefore} → ${report.rankSumAfter})`}
      </p>
      <RankNonagon
        categories={report.categories.map((category) => ({
          label: CATEGORY_SHORT_LABELS[category.categoryId],
          rankBefore: category.rankBefore,
          rankAfter: category.rankAfter,
        }))}
        teamCount={teamCount}
      />
      <ul className="flex flex-col gap-1 text-sm">
        {report.categories.map((category) => (
          <li className="flex justify-between gap-2" key={category.categoryId}>
            <span>{CATEGORY_SHORT_LABELS[category.categoryId]}</span>
            <span>
              {`${formatTotal(category.categoryId, category.beforeTotal)} → ${formatTotal(category.categoryId, category.afterTotal)}`}
            </span>
            <span>{rankText(category.rankBefore, category.rankAfter)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
