import type { MatchupBoard as MatchupBoardData } from "@/lib/matchup/types"
import {
  CATEGORY_SHORT_LABELS,
  formatCategoryStat,
} from "@/lib/season/formatCategoryStat"

type MatchupBoardProps = {
  board: MatchupBoardData
}

const outcomeClass = (outcome: "W" | "L" | "T") => {
  if (outcome === "W") return "text-[var(--color-info)]"
  if (outcome === "L") return "text-[var(--color-sale)]"
  return "text-[var(--color-mute)]"
}

export const MatchupBoard = ({ board }: MatchupBoardProps) => (
  <section
    aria-label="Matchup board"
    className="rounded-3xl bg-[var(--color-soft-cloud)] p-5"
  >
    <p className="text-center font-[family-name:var(--font-bebas-neue)] text-3xl tracking-wide uppercase sm:text-4xl">
      YOU {board.wins} — Opp {board.losses} — Tie {board.ties}
    </p>
    <p className="mt-1 text-center text-xs text-[var(--color-mute)]">
      Projected {board.projectedCatWins.toFixed(2)} category wins
    </p>
    <div className="mt-5 grid grid-cols-3 gap-2 text-[0.8125rem] sm:grid-cols-5 lg:grid-cols-9">
      {board.categories.map((row) => (
        <div
          className="rounded-xl border border-[var(--color-hairline)] bg-white px-2 py-2 text-center"
          key={row.categoryId}
        >
          <p className="text-xs font-medium tracking-wide text-[var(--color-mute)]">
            {CATEGORY_SHORT_LABELS[row.categoryId]}
          </p>
          <p className={`mt-1 text-lg font-semibold ${outcomeClass(row.outcome)}`}>
            {row.outcome}
          </p>
          <p className="mt-1 text-xs tabular-nums text-[var(--color-mute)]">
            {formatCategoryStat(row.categoryId, row.you)} vs{" "}
            {formatCategoryStat(row.categoryId, row.opp)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-[var(--color-mute)]">
            {(row.winProb * 100).toFixed(0)}%
          </p>
        </div>
      ))}
    </div>
  </section>
)
