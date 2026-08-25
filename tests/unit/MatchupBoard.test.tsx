// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MatchupBoard } from "@/components/matchup/MatchupBoard"
import type { MatchupBoard as MatchupBoardData } from "@/lib/matchup/types"
import { formatCategoryStat } from "@/lib/season/formatCategoryStat"

const board: MatchupBoardData = {
  wins: 2,
  losses: 1,
  ties: 0,
  projectedCatWins: 5.25,
  categories: [
    {
      categoryId: "PTS",
      you: 112.4,
      opp: 108.1,
      outcome: "W",
      winProb: 0.62,
    },
    {
      categoryId: "REB",
      you: 40,
      opp: 44,
      outcome: "L",
      winProb: 0.35,
    },
    {
      categoryId: "AST",
      you: 25,
      opp: 25,
      outcome: "T",
      winProb: 0.5,
    },
  ],
}

describe("MatchupBoard scoreboard table", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders horizontal You/Opp scoreboard with score up top", () => {
    render(<MatchupBoard board={board} />)

    expect(screen.getByRole("rowheader", { name: /^You$/i })).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: /^Opp$/i })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: /^PTS$/i })).toBeInTheDocument()

    expect(
      screen.getByText(formatCategoryStat("PTS", 112.4)),
    ).toBeInTheDocument()
    expect(
      screen.getByText(formatCategoryStat("PTS", 108.1)),
    ).toBeInTheDocument()

    expect(screen.queryByText(/ vs /i)).not.toBeInTheDocument()
    expect(screen.queryByText(/YOU 2/i)).not.toBeInTheDocument()

    expect(screen.getByText("2–1–0")).toBeInTheDocument()
    expect(screen.getByText(/Projected 5\.25 cat wins/i)).toBeInTheDocument()
    expect(screen.queryByText("62%")).not.toBeInTheDocument()
  })
})
