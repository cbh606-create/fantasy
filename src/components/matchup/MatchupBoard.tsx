import type { MatchupBoard as MatchupBoardData } from "@/lib/matchup/types"
import type { CategoryOutcome } from "@/lib/matchup/types"
import {
  CATEGORY_SHORT_LABELS,
  formatCategoryStat,
} from "@/lib/season/formatCategoryStat"

type MatchupBoardProps = {
  board: MatchupBoardData
}

const valueClass = (
  side: "you" | "opp",
  outcome: CategoryOutcome,
): string => {
  const won =
    (side === "you" && outcome === "W") ||
    (side === "opp" && outcome === "L")
  const lost =
    (side === "you" && outcome === "L") ||
    (side === "opp" && outcome === "W")

  if (won) {
    return side === "you"
      ? "font-semibold tabular-nums text-[var(--color-info)]"
      : "font-semibold tabular-nums text-[var(--color-sale)]"
  }
  if (lost || outcome === "T") {
    return "tabular-nums text-[var(--color-mute)]"
  }
  return "tabular-nums text-[var(--color-ink)]"
}

export const MatchupBoard = ({ board }: MatchupBoardProps) => (
  <section
    aria-label="Matchup board"
    className="rounded-3xl bg-[var(--color-soft-cloud)] p-5"
  >
    <div className="overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse text-[0.875rem]">
        <thead>
          <tr className="text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <th className="px-2 py-1.5 text-right font-medium" scope="col">
              You
            </th>
            <th className="px-2 py-1.5 text-center font-medium" scope="col">
              <span className="sr-only">Category</span>
            </th>
            <th className="px-2 py-1.5 text-left font-medium" scope="col">
              Opp
            </th>
          </tr>
        </thead>
        <tbody>
          {board.categories.map((row) => (
            <tr
              className="border-t border-[var(--color-hairline)]"
              key={row.categoryId}
            >
              <td className={`px-2 py-1.5 text-right ${valueClass("you", row.outcome)}`}>
                {formatCategoryStat(row.categoryId, row.you)}
              </td>
              <th
                className="px-2 py-1.5 text-center text-[0.75rem] font-medium tracking-wide text-[var(--color-mute)]"
                scope="row"
              >
                {CATEGORY_SHORT_LABELS[row.categoryId]}
              </th>
              <td className={`px-2 py-1.5 text-left ${valueClass("opp", row.outcome)}`}>
                {formatCategoryStat(row.categoryId, row.opp)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--color-hairline)]">
            <td
              className="px-2 pt-3 text-center text-[0.8125rem]"
              colSpan={3}
            >
              <span className="font-semibold tabular-nums text-[var(--color-ink)]">
                {board.wins}–{board.losses}–{board.ties}
              </span>
              <span className="ml-2 text-[var(--color-mute)]">
                Projected {board.projectedCatWins.toFixed(2)} cat wins
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
)
