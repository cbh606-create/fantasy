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
  return "tabular-nums text-[var(--color-mute)]"
}

export const MatchupBoard = ({ board }: MatchupBoardProps) => (
  <section
    aria-label="Matchup board"
    className="rounded-3xl bg-[var(--color-soft-cloud)] p-5"
  >
    <div className="mb-4 text-center">
      <p className="font-[family-name:var(--font-bebas-neue)] text-4xl tracking-wide tabular-nums text-[var(--color-ink)] sm:text-5xl">
        {board.wins}–{board.losses}–{board.ties}
      </p>
      <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
        Projected {board.projectedCatWins.toFixed(2)} cat wins
      </p>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-[0.875rem]">
        <thead>
          <tr className="text-[0.7rem] tracking-[0.08em] text-[var(--color-mute)] uppercase">
            <th className="px-2 py-1.5 text-left font-medium" scope="col">
              <span className="sr-only">Team</span>
            </th>
            {board.categories.map((row) => (
              <th
                className="px-2 py-1.5 text-center font-medium"
                key={row.categoryId}
                scope="col"
              >
                {CATEGORY_SHORT_LABELS[row.categoryId]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[var(--color-hairline)]">
            <th
              className="whitespace-nowrap px-2 py-1.5 text-left text-[0.75rem] font-medium tracking-wide text-[var(--color-mute)] uppercase"
              scope="row"
            >
              You
            </th>
            {board.categories.map((row) => (
              <td
                className={`px-2 py-1.5 text-center ${valueClass("you", row.outcome)}`}
                key={`you-${row.categoryId}`}
              >
                {formatCategoryStat(row.categoryId, row.you)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-[var(--color-hairline)]">
            <th
              className="whitespace-nowrap px-2 py-1.5 text-left text-[0.75rem] font-medium tracking-wide text-[var(--color-mute)] uppercase"
              scope="row"
            >
              Opp
            </th>
            {board.categories.map((row) => (
              <td
                className={`px-2 py-1.5 text-center ${valueClass("opp", row.outcome)}`}
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
