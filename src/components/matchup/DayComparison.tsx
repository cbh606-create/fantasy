import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { CategoryTotals, DayComparisonRow } from "@/lib/matchup/morningCheck"
import {
  CATEGORY_SHORT_LABELS,
  formatCategoryStat,
} from "@/lib/season/formatCategoryStat"

type DayComparisonProps = {
  days: string[]
  rows: DayComparisonRow[]
  week: DayComparisonRow
}

const gamesLabel = (games: number | undefined): string =>
  games == null ? "—" : String(games)

const GamesCell = ({
  emphasized,
  games,
}: {
  emphasized: boolean
  games: number | undefined
}) => (
  <td className="whitespace-nowrap px-1 py-0.5 text-center align-middle">
    <p
      aria-hidden="true"
      className={`leading-tight text-transparent tabular-nums ${
        emphasized ? "text-xs" : "text-[0.6875rem]"
      }`}
    >
      0
    </p>
    <p className="leading-tight tabular-nums text-[var(--color-ink)]">
      {gamesLabel(games)}
    </p>
  </td>
)

const cellValue = (
  categoryId: CategoryId,
  totals: CategoryTotals | null | undefined,
): string => {
  if (!totals) return "—"
  return formatCategoryStat(categoryId, totals[categoryId])
}

const StatCell = ({
  categoryId,
  emphasized,
  projection,
  actual,
}: {
  categoryId: CategoryId
  emphasized: boolean
  projection: CategoryTotals | undefined
  actual: CategoryTotals | null | undefined
}) => (
  <td className="whitespace-nowrap px-1 py-0.5 text-center align-middle">
    <p
      className={`leading-tight text-[var(--color-mute)] tabular-nums ${
        emphasized ? "text-xs" : "text-[0.6875rem]"
      }`}
    >
      {cellValue(categoryId, projection)}
    </p>
    <p className="leading-tight tabular-nums text-[var(--color-ink)]">
      {cellValue(categoryId, actual)}
    </p>
  </td>
)

export const DayComparison = ({ days, rows, week }: DayComparisonProps) => {
  if (days.length === 0) return null
  const rowByDate = new Map(rows.map((row) => [row.date, row]))

  return (
    <div className="flex flex-col items-start gap-3 xl:flex-row">
      <div className="min-w-0 w-full max-w-3xl space-y-1.5">
        {days.map((date) => (
          <ComparisonTable
            key={date}
            label={date}
            row={rowByDate.get(date)}
          />
        ))}
      </div>
      <div className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[52rem]">
        <ComparisonTable emphasized label="Week" row={week} />
      </div>
    </div>
  )
}

const ComparisonTable = ({
  emphasized = false,
  label,
  row,
}: {
  emphasized?: boolean
  label: string
  row: DayComparisonRow | undefined
}) => (
  <section
    aria-label={`Day comparison ${label}`}
    className={`overflow-x-auto rounded-2xl ${
      emphasized
        ? "bg-[#e4e6ea] px-4 py-3"
        : "bg-[var(--color-soft-cloud)] px-3 py-1.5"
    }`}
  >
    <h2
      className={`font-medium text-[var(--color-ink)] ${
        emphasized ? "text-base" : "text-[0.8125rem]"
      }`}
    >
      {label}
    </h2>
    <table
      className={`mt-0.5 w-full table-fixed border-collapse ${
        emphasized
          ? "min-w-[48rem] text-base"
          : "min-w-[40rem] text-[0.8125rem]"
      }`}
    >
      <colgroup>
        <col className="w-10" />
        <col className="w-8" />
        {ALL_CATEGORY_IDS.map((categoryId) => (
          <col key={categoryId} />
        ))}
      </colgroup>
      <thead>
        <tr
          className={`tracking-[0.06em] text-[var(--color-mute)] uppercase ${
            emphasized ? "text-sm" : "text-xs"
          }`}
        >
          <th className="px-1 py-0.5 text-left font-medium" scope="col">
            <span className="sr-only">Team</span>
          </th>
          <th
            className="whitespace-nowrap px-1 py-0.5 text-center font-medium"
            scope="col"
          >
            GP
          </th>
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <th
              className="whitespace-nowrap px-0.5 py-0.5 text-center font-medium"
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
            className={`whitespace-nowrap px-1 py-0.5 text-left font-medium text-[var(--color-mute)] uppercase ${
              emphasized ? "text-sm" : "text-xs"
            }`}
            scope="row"
          >
            You
          </th>
          <GamesCell emphasized={emphasized} games={row?.youGames} />
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <StatCell
              actual={row?.youActual}
              categoryId={categoryId}
              emphasized={emphasized}
              key={categoryId}
              projection={row?.youProjection}
            />
          ))}
        </tr>
        <tr>
          <th
            className={`whitespace-nowrap px-1 py-0.5 text-left font-medium text-[var(--color-mute)] uppercase ${
              emphasized ? "text-sm" : "text-xs"
            }`}
            scope="row"
          >
            Opp
          </th>
          <GamesCell emphasized={emphasized} games={row?.oppGames} />
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <StatCell
              actual={row?.oppActual}
              categoryId={categoryId}
              emphasized={emphasized}
              key={categoryId}
              projection={row?.oppProjection}
            />
          ))}
        </tr>
      </tbody>
    </table>
  </section>
)
