// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MatchupBoard } from "@/components/matchup/MatchupBoard"
import type { MatchupBoard as MatchupBoardData } from "@/lib/matchup/types"

const board: MatchupBoardData = {
  wins: 2,
  losses: 1,
  ties: 0,
  projectedCatWins: 1.8,
  categories: [
    {
      categoryId: "PTS",
      you: 120,
      opp: 110,
      outcome: "W",
      winProb: 0.7,
    },
    {
      categoryId: "TO",
      you: 8,
      opp: 10,
      outcome: "W",
      winProb: 0.6,
    },
    {
      categoryId: "REB",
      you: 40,
      opp: 44,
      outcome: "L",
      winProb: 0.35,
    },
    {
      categoryId: "FG_PCT",
      you: 0.48,
      opp: 0.47,
      outcome: "W",
      winProb: 0.55,
    },
  ],
}

describe("MatchupBoard", () => {
  afterEach(() => cleanup())

  it("shows the signed lead under each category", () => {
    render(<MatchupBoard board={board} />)

    expect(screen.getByRole("rowheader", { name: "Diff" })).toBeInTheDocument()
    const winLabel = screen.getByRole("rowheader", { name: "Win%" })
    expect(winLabel).toBeInTheDocument()
    expect(winLabel.className).toContain("color-mix")
    expect(screen.getByText("70.0%")).toBeInTheDocument()
    expect(screen.getByText("35.0%")).toBeInTheDocument()
    expect(screen.getByText("+10.0")).toBeInTheDocument()
    expect(screen.getByText("+2.0")).toBeInTheDocument()
    expect(screen.getByText("-4.0")).toBeInTheDocument()
    expect(screen.getByText("+1.00%")).toBeInTheDocument()
  })

  it("shows a most-categories lead as the category record", () => {
    render(
      <MatchupBoard
        board={{ ...board, wins: 4, losses: 5, ties: 0, projectedCatWins: 4.2 }}
      />,
    )

    expect(screen.getByText("4–5–0")).toBeInTheDocument()
    expect(screen.getByText("Proj 4.20")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "PTS" })).toBeInTheDocument()
  })

  it("keeps a most-categories tie in the category record", () => {
    render(
      <MatchupBoard board={{ ...board, wins: 4, losses: 4, ties: 1 }} />,
    )

    expect(screen.getByText("4–4–1")).toBeInTheDocument()
  })

  it("keeps the category record for each category", () => {
    render(
      <MatchupBoard board={{ ...board, wins: 5, losses: 4, ties: 0 }} />,
    )

    expect(screen.getByText("5–4–0")).toBeInTheDocument()
  })

  it("keeps the category record when scoring mode is missing", () => {
    render(<MatchupBoard board={{ ...board, wins: 2, losses: 1, ties: 0 }} />)

    expect(screen.getByText("2–1–0")).toBeInTheDocument()
  })

  it("shows a category delta only when one is passed", () => {
    render(<MatchupBoard board={board} categoryDeltas={{ PTS: 2, TO: -1 }} />)
    expect(screen.getAllByText("+2.0")).toHaveLength(2)
    expect(screen.getByText("-1.0")).toBeInTheDocument()
    expect(screen.queryByText("+0.0")).not.toBeInTheDocument()
  })
})
