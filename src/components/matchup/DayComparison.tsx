import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { CategoryTotals, DayComparisonRow } from "@/lib/matchup/morningCheck"
import { weekAdvantage } from "@/lib/matchup/projectionDelta"
import {
  CATEGORY_SHORT_LABELS,
  formatCategoryStat,
  formatCategoryStatDelta,
} from "@/lib/season/formatCategoryStat"

type DayComparisonProps = {
  days: string[]
  rows: DayComparisonRow[]
  week: DayComparisonRow
}

const gamesLabel = (games: number | undefined): string =>
  games == null ? "—" : String(games)

const lineSize = (emphasized: boolean): string =>
  emphasized ? "text-xs" : "text-[0.6875rem]"

const deltaToneClass = (categoryId: CategoryId, delta: number): string => {
  if (delta === 0) return "text-[var(--color-mute)]"
  const better = categoryId === "TO" ? delta < 0 : delta > 0
  if (better) return "text-[var(--color-success)]"
  return "text-[var(--color-sale)]"
}

const advantageTone = (value: number): string => {
  if (value === 0) return "text-[var(--color-mute)]"
  if (value > 0) return "text-[var(--color-success)]"
  return "text-[var(--color-sale)]"
}

const GamesCell = ({
  emphasized,
  games,
  showDelta,
}: {
  emphasized: boolean
  games: number | undefined
  showDelta: boolean
}) => (
  <td className="whitespace-nowrap px-1 py-0.5 text-center align-middle">
    <p
      aria-hidden="true"
      className={`leading-tight text-transparent tabular-nums ${lineSize(emphasized)}`}
    >
      0
    </p>
    <p className="leading-tight tabular-nums text-[var(--color-ink)]">
      {gamesLabel(games)}
    </p>
    {showDelta ? (
      <p
        aria-hidden="true"
        className={`leading-tight text-transparent tabular-nums ${lineSize(emphasized)}`}
      >
        0
      </p>
    ) : null}
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
  actual,
  categoryId,
  delta,
  emphasized,
  projection,
  showDelta,
}: {
  actual: CategoryTotals | null | undefined
  categoryId: CategoryId
  delta?: number
  emphasized: boolean
  projection: CategoryTotals | undefined
  showDelta: boolean
}) => (
  <td className="whitespace-nowrap px-1 py-0.5 text-center align-middle">
    <p
      className={`leading-tight text-[var(--color-mute)] tabular-nums ${lineSize(emphasized)}`}
    >
      {cellValue(categoryId, projection)}
    </p>
    <p className="leading-tight tabular-nums text-[var(--color-ink)]">
      {cellValue(categoryId, actual)}
    </p>
    {showDelta ? (
      typeof delta === "number" && Number.isFinite(delta) ? (
        <p
          aria-label="Actual minus projection"
          className={`leading-tight tabular-nums ${lineSize(emphasized)} ${deltaToneClass(categoryId, delta)}`}
        >
          {formatCategoryStatDelta(categoryId, delta)}
        </p>
      ) : (
        <p
          className={`leading-tight tabular-nums text-[var(--color-mute)] ${lineSize(emphasized)}`}
        >
          —
        </p>
      )
    ) : null}
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

const finiteStat = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value)

const WeekCategoryCell = ({
  categoryId,
  kind,
  value,
}: {
  categoryId: CategoryId
  kind: "total" | "delta" | "advantage"
  value: number | null | undefined
}) => {
  const finite = finiteStat(value)
  const text = !finite
    ? "—"
    : kind === "total"
      ? formatCategoryStat(categoryId, value)
      : formatCategoryStatDelta(categoryId, value)
  const tone = !finite
    ? "text-[var(--color-mute)]"
    : kind === "advantage"
      ? advantageTone(value)
      : kind === "delta"
        ? deltaToneClass(categoryId, value)
        : "text-[var(--color-ink)]"

  return (
    <td
      aria-label={
        kind === "advantage" && finite
          ? `Category advantage ${CATEGORY_SHORT_LABELS[categoryId]}`
          : undefined
      }
      className={`whitespace-nowrap px-1 py-0.5 text-center align-middle tabular-nums ${tone}`}
    >
      {text}
    </td>
  )
}

const WeekStatRow = ({
  games,
  kind,
  shade,
  showGames = false,
  team,
  title,
  totals,
}: {
  games?: number
  kind: "total" | "delta" | "advantage"
  shade: string
  showGames?: boolean
  team?: string
  title: string
  totals: CategoryTotals | null | undefined
}) => (
  <tr className={shade}>
    {team ? (
      <th
        className="whitespace-nowrap px-1 py-0.5 text-left align-middle text-sm font-medium text-[var(--color-mute)] uppercase"
        rowSpan={3}
        scope="row"
      >
        {team}
      </th>
    ) : null}
    {kind === "advantage" ? <td className="px-1 py-0.5" /> : null}
    <th
      className="whitespace-nowrap px-1 py-0.5 text-left text-sm font-medium text-[var(--color-mute)]"
      scope="row"
    >
      {title}
    </th>
    <td className="whitespace-nowrap px-1 py-0.5 text-center align-middle tabular-nums text-[var(--color-ink)]">
      {showGames ? gamesLabel(games) : ""}
    </td>
    {ALL_CATEGORY_IDS.map((categoryId) => (
      <WeekCategoryCell
        categoryId={categoryId}
        key={categoryId}
        kind={kind}
        value={totals?.[categoryId]}
      />
    ))}
  </tr>
)

const WeekTable = ({ row }: { row: DayComparisonRow | undefined }) => {
  const advantage = weekAdvantage(row?.youDelta, row?.oppDelta)

  return (
    <table className="mt-0.5 w-full min-w-[48rem] table-fixed border-collapse text-base">
      <colgroup>
        <col className="w-10" />
        <col className="w-12" />
        <col className="w-8" />
        {ALL_CATEGORY_IDS.map((categoryId) => (
          <col key={categoryId} />
        ))}
      </colgroup>
      <thead>
        <tr className="text-sm tracking-[0.06em] text-[var(--color-mute)] uppercase">
          <th className="px-1 py-0.5 text-left font-medium" scope="col">
            <span className="sr-only">Team</span>
          </th>
          <th className="px-1 py-0.5 text-left font-medium" scope="col">
            <span className="sr-only">Row</span>
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
        <WeekStatRow
          games={row?.youGames}
          kind="total"
          shade="bg-white"
          showGames
          team="You"
          title="합계"
          totals={row?.youProjection}
        />
        <WeekStatRow
          kind="total"
          shade="bg-white"
          title="실제"
          totals={row?.youActual}
        />
        <WeekStatRow
          kind="delta"
          shade="bg-white"
          title="차이"
          totals={row?.youDelta}
        />
        <WeekStatRow
          games={row?.oppGames}
          kind="total"
          shade="bg-[var(--color-soft-cloud)]"
          showGames
          team="Opp"
          title="합계"
          totals={row?.oppProjection}
        />
        <WeekStatRow
          kind="total"
          shade="bg-[var(--color-soft-cloud)]"
          title="실제"
          totals={row?.oppActual}
        />
        <WeekStatRow
          kind="delta"
          shade="bg-[var(--color-soft-cloud)]"
          title="차이"
          totals={row?.oppDelta}
        />
        <WeekStatRow
          kind="advantage"
          shade="bg-[color-mix(in_srgb,var(--color-success)_14%,white)]"
          title="+/-"
          totals={advantage}
        />
      </tbody>
    </table>
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
    {emphasized ? (
      <WeekTable row={row} />
    ) : (
    <table className="mt-0.5 w-full min-w-[40rem] table-fixed border-collapse text-[0.8125rem]">
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
          <GamesCell
            emphasized={emphasized}
            games={row?.youGames}
            showDelta={row?.youDelta != null}
          />
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <StatCell
              actual={row?.youActual}
              categoryId={categoryId}
              delta={row?.youDelta?.[categoryId]}
              emphasized={emphasized}
              key={categoryId}
              projection={row?.youProjection}
              showDelta={row?.youDelta != null}
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
          <GamesCell
            emphasized={emphasized}
            games={row?.oppGames}
            showDelta={row?.oppDelta != null}
          />
          {ALL_CATEGORY_IDS.map((categoryId) => (
            <StatCell
              actual={row?.oppActual}
              categoryId={categoryId}
              delta={row?.oppDelta?.[categoryId]}
              emphasized={emphasized}
              key={categoryId}
              projection={row?.oppProjection}
              showDelta={row?.oppDelta != null}
            />
          ))}
        </tr>
      </tbody>
    </table>
    )}
  </section>
)
