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

  if (won) {
    return side === "you"
      ? "font-semibold tabular-nums text-[var(--color-info)]"
      : "font-semibold tabular-nums text-[var(--color-sale)]"
  }
  return "tabular-nums text-[var(--color-mute)]"
}

export const MatchupBoard = ({ board }: MatchupBoardProps) => (
  <section
    aria-label="Matchup board"
    className="rounded-3xl bg-[var(--color-soft-cloud)] px-4 py-3 sm:px-5"
  >
    <div className="flex min-h-[4.75rem] items-stretch gap-4 overflow-x-auto">
      <div className="flex shrink-0 flex-col justify-center border-r border-[var(--color-hairline)] pr-4">
        <p className="font-[family-name:var(--font-bebas-neue)] text-3xl leading-none tracking-wide tabular-nums text-[var(--color-ink)] sm:text-4xl">
          {board.wins}–{board.losses}–{board.ties}
        </p>
        <p className="mt-1 whitespace-nowrap text-[0.8125rem] text-[var(--color-mute)]">
          Proj {board.projectedCatWins.toFixed(2)}
        </p>
      </div>

      <table className="w-full min-w-[28rem] flex-1 border-collapse text-base">
        <thead>
          <tr className="text-[0.75rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <th className="px-1.5 py-1 text-left font-medium" scope="col">
              <span className="sr-only">Team</span>
            </th>
            {board.categories.map((row) => (
              <th
                className="px-1.5 py-1 text-center font-medium"
                key={row.categoryId}
                scope="col"
              >
                {CATEGORY_SHORT_LABELS[row.categoryId]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th
              className="whitespace-nowrap px-1.5 py-0.5 text-left text-[0.8125rem] font-medium tracking-wide text-[var(--color-mute)] uppercase"
              scope="row"
            >
              You
            </th>
            {board.categories.map((row) => (
              <td
                className={`px-1.5 py-0.5 text-center ${valueClass("you", row.outcome)}`}
                key={`you-${row.categoryId}`}
              >
                {formatCategoryStat(row.categoryId, row.you)}
              </td>
            ))}
          </tr>
          <tr>
            <th
              className="whitespace-nowrap px-1.5 py-0.5 text-left text-[0.8125rem] font-medium tracking-wide text-[var(--color-mute)] uppercase"
              scope="row"
            >
              Opp
            </th>
            {board.categories.map((row) => (
              <td
                className={`px-1.5 py-0.5 text-center ${valueClass("opp", row.outcome)}`}
                key={`opp-${row.categoryId}`}
              >
                {formatCategoryStat(row.categoryId, row.opp)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  </section>
)
