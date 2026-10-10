import {
  morningActualsPendingCopy,
  morningStaleCopy,
  morningUnchangedCopy,
  type MorningSummary as MorningSummaryData,
} from "@/lib/matchup/morningCheck"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"

type MorningSummaryProps = {
  summary: MorningSummaryData
  stale: boolean
}

export const MorningSummary = ({ summary, stale }: MorningSummaryProps) => (
  <section
    aria-label="Morning check"
    className="mb-4 rounded-3xl bg-[var(--color-soft-cloud)] px-4 py-3"
  >
    {stale ? (
      <p className="text-sm text-[var(--color-mute)]">{morningStaleCopy}</p>
    ) : null}
    {summary.actualsPending ? (
      <p className="text-sm text-[var(--color-mute)]">{morningActualsPendingCopy}</p>
    ) : null}
    <ul className="mt-2 flex flex-wrap gap-2">
      {summary.categories.map((row) => (
        <li
          className="rounded-full bg-[var(--color-canvas)] px-2 py-1 text-sm text-[var(--color-ink)]"
          key={row.categoryId}
        >
          {CATEGORY_SHORT_LABELS[row.categoryId]} {row.outcome}
          {row.flipped ? " flipped" : ""}
        </li>
      ))}
    </ul>
    {summary.opponentMoves.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.opponentMoves.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
    {summary.ourAbsences.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.ourAbsences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
    {summary.recommendationsUnchanged ? (
      <p className="mt-2 text-sm text-[var(--color-ink)]">{morningUnchangedCopy}</p>
    ) : null}
    {summary.recommendationChanges.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.recommendationChanges.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
    {summary.todayRecommendations.length > 0 ? (
      <ul className="mt-2 text-sm text-[var(--color-ink)]">
        {summary.todayRecommendations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null}
  </section>
)
