// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DayComparison } from "@/components/matchup/DayComparison"
import {
  emptyCategoryTotals,
  type CategoryTotals,
  type DayComparisonRow,
} from "@/lib/matchup/morningCheck"

const totals = (overrides: Partial<CategoryTotals> = {}): CategoryTotals => ({
  ...emptyCategoryTotals(),
  ...overrides,
})

const row = (overrides: Partial<DayComparisonRow> & { date: string }): DayComparisonRow => ({
  youProjection: totals(),
  youActual: null,
  oppProjection: totals(),
  oppActual: null,
  ...overrides,
})

describe("DayComparison", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows actual minus projection only on rows that have a delta", () => {
    const played = row({
      date: "2026-10-20",
      youGames: 3,
      youProjection: totals({ PTS: 20, FG_PCT: 0.5, FT_PCT: 0.8 }),
      youActual: totals({ PTS: 18, FG_PCT: 0.4, FT_PCT: 0.75 }),
      youDelta: totals({ PTS: -2, FG_PCT: -0.1, FT_PCT: -0.05 }),
      oppGames: 3,
      oppProjection: totals({ PTS: 22 }),
    })
    const open = row({
      date: "2026-10-21",
      youGames: 4,
      youProjection: totals({ PTS: 30, FG_PCT: 0.45 }),
      oppProjection: totals({ PTS: 28 }),
    })
    const week = row({
      date: "week",
      youGames: 7,
      youProjection: totals({ PTS: 80, FG_PCT: 0.47, TO: 10 }),
      youActual: totals({ PTS: 18, FG_PCT: 0.4, TO: 8 }),
      youDelta: totals({ PTS: 4, FG_PCT: 0.02, TO: -2 }),
      oppGames: 6,
      oppProjection: totals({ PTS: 70, TO: 9 }),
      oppActual: totals({ PTS: 12, TO: 12 }),
      oppDelta: totals({ PTS: 1, FG_PCT: -0.01, TO: 3 }),
    })

    render(<DayComparison days={["2026-10-20", "2026-10-21"]} rows={[played, open]} week={week} />)

    const playedTable = screen.getByRole("region", { name: "Day comparison 2026-10-20" })
    expect(within(playedTable).getByText("20.0")).toBeInTheDocument()
    expect(within(playedTable).getByText("18.0")).toBeInTheDocument()
    expect(within(playedTable).getByText("-2.0")).toBeInTheDocument()
    expect(within(playedTable).getByText("-2.0")).toHaveClass("text-[var(--color-sale)]")
    expect(within(playedTable).getByText("-10.00%")).toBeInTheDocument()
    expect(within(playedTable).getAllByLabelText("Actual minus projection")).toHaveLength(9)

    const openTable = screen.getByRole("region", { name: "Day comparison 2026-10-21" })
    expect(within(openTable).getByText("30.0")).toBeInTheDocument()
    expect(within(openTable).queryByText("-2.0")).not.toBeInTheDocument()
    expect(within(openTable).queryByLabelText("Actual minus projection")).not.toBeInTheDocument()

    const weekTable = screen.getByRole("region", { name: "Day comparison Week" })
    expect(within(weekTable).getAllByRole("rowheader", { name: "합계" })).toHaveLength(2)
    expect(within(weekTable).getAllByRole("rowheader", { name: "실제" })).toHaveLength(2)
    expect(within(weekTable).getAllByRole("rowheader", { name: "차이" })).toHaveLength(2)
    expect(within(weekTable).getByRole("rowheader", { name: "+/-" })).toBeInTheDocument()
    expect(within(weekTable).getByRole("rowheader", { name: "You" })).toBeInTheDocument()
    expect(within(weekTable).getByRole("rowheader", { name: "Opp" })).toBeInTheDocument()
    expect(within(weekTable).getByText("80.0")).toBeInTheDocument()
    expect(within(weekTable).getByText("18.0")).toBeInTheDocument()
    expect(within(weekTable).getByText("+4.0")).toHaveClass("text-[var(--color-success)]")
    expect(within(weekTable).getByText("-2.0")).toHaveClass("text-[var(--color-success)]")
    expect(within(weekTable).getByLabelText("Category advantage PTS")).toHaveTextContent("+3.0")
    expect(within(weekTable).getByLabelText("Category advantage PTS")).toHaveClass("text-[var(--color-success)]")
    expect(within(weekTable).getByLabelText("Category advantage TO")).toHaveTextContent("+5.0")
    expect(within(weekTable).getByLabelText("Category advantage TO")).toHaveClass("text-[var(--color-success)]")
    expect(within(weekTable).getByLabelText("Category advantage REB")).toHaveTextContent("0.0")
    expect(within(weekTable).getByLabelText("Category advantage REB")).toHaveClass("text-[var(--color-mute)]")
    const headlineRows = within(weekTable).getAllByRole("rowheader", { name: "합계" })
    expect(headlineRows[0]?.closest("tr")).toHaveTextContent("7")
    expect(headlineRows[1]?.closest("tr")).toHaveTextContent("6")
    expect(within(weekTable).getAllByRole("rowheader", { name: "실제" })[0]?.closest("tr")).not.toHaveTextContent("7")
  })

  it("omits category advantage when the opponent has no delta", () => {
    const week = row({
      date: "week",
      youGames: 7,
      youProjection: totals({ PTS: 80 }),
      youActual: totals({ PTS: 18 }),
      youDelta: totals({ PTS: 4 }),
      oppGames: 6,
      oppProjection: totals({ PTS: 70 }),
      oppDelta: null,
    })

    render(
      <DayComparison
        days={["2026-10-21"]}
        rows={[row({ date: "2026-10-21", youProjection: totals({ PTS: 30 }) })]}
        week={week}
      />,
    )

    const weekTable = screen.getByRole("region", { name: "Day comparison Week" })
    expect(within(weekTable).queryByLabelText("Category advantage PTS")).toBeNull()
  })
})
