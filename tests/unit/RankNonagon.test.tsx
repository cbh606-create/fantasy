// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RankNonagon, rankRadius } from "@/components/trade/RankNonagon"

afterEach(() => {
  cleanup()
})

describe("RankNonagon", () => {
  it("puts rank 1 on the outer radius and last place at 15 percent", () => {
    expect(rankRadius(1, 12, 100)).toBe(100)
    expect(rankRadius(12, 12, 100)).toBe(15)
    expect(rankRadius(6, 12, 100)).toBeGreaterThan(15)
    expect(rankRadius(6, 12, 100)).toBeLessThan(100)
  })

  it("labels each vertex with the rank change", () => {
    const labels = ["FG%", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS"]
    render(
      <RankNonagon
        categories={labels.map((label, index) => ({
          label,
          rankBefore: index === 0 ? 8 : 5,
          rankAfter: index === 0 ? 4 : 5,
        }))}
        teamCount={12}
      />,
    )

    const rankText = screen.getByText("#8 → #4").closest("text")
    expect(rankText).toHaveAttribute("font-size", "9")

    expect(screen.getByText("#8 → #4")).toBeInTheDocument()
    expect(screen.getAllByText("#5")).toHaveLength(8)
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
