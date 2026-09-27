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
    expect(screen.getByText("+10.0")).toBeInTheDocument()
    expect(screen.getByText("+2.0")).toBeInTheDocument()
    expect(screen.getByText("-4.0")).toBeInTheDocument()
    expect(screen.getByText("+1.00%")).toBeInTheDocument()
  })

  it("shows a most-categories lead as one week win", () => {
    render(
      <MatchupBoard
        board={{ ...board, wins: 5, losses: 4, ties: 0, projectedCatWins: 4.2 }}
        scoringMode="most_categories"
      />,
    )

    expect(screen.getByText("1–0")).toBeInTheDocument()
    expect(screen.getByText("Proj 4.20")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "PTS" })).toBeInTheDocument()
  })

  it("shows an even most-categories record as a tie", () => {
    render(
      <MatchupBoard
        board={{ ...board, wins: 4, losses: 4, ties: 1 }}
        scoringMode="most_categories"
      />,
    )

    expect(screen.getByText("0–0–1")).toBeInTheDocument()
  })

  it("keeps the category record for each category", () => {
    render(
      <MatchupBoard
        board={{ ...board, wins: 5, losses: 4, ties: 0 }}
        scoringMode="each_category"
      />,
    )

    expect(screen.getByText("5–4–0")).toBeInTheDocument()
  })

  it("keeps the category record when scoring mode is missing", () => {
    render(<MatchupBoard board={{ ...board, wins: 2, losses: 1, ties: 0 }} />)

    expect(screen.getByText("2–1–0")).toBeInTheDocument()
  })
})
