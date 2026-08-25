// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RatioSitsPanel } from "@/components/matchup/RatioSitsPanel"
import type { RatioSitSuggestion } from "@/lib/matchup/types"

const playersById = {
  "brick-1": {
    id: "brick-1",
    name: "Brick Shooter",
    teamAbbr: "BOS",
    projections: {
      FG_PCT: 0.35,
      FT_PCT: 0.6,
      TPM: 0,
      REB: 2,
      AST: 1,
      STL: 0,
      BLK: 0,
      TO: 1,
      PTS: 6,
    },
    shooting: { FGM: 2, FGA: 6, FTM: 1, FTA: 2 },
  },
}

const suggestion: RatioSitSuggestion = {
  playerId: "brick-1",
  date: "2025-11-03",
  targetCategoryId: "FG_PCT",
  deltaWinProb: 0.12,
  reason: "Sit on Mon · helps FG% (+0.12) · counting W preserved",
}

afterEach(() => cleanup())

describe("RatioSitsPanel", () => {
  it("calls onApply with the suggestion when Apply is clicked", () => {
    const onApply = vi.fn()

    render(
      <RatioSitsPanel
        applyingKey={null}
        onApply={onApply}
        playersById={playersById}
        suggestions={[suggestion]}
      />,
    )

    expect(screen.getByRole("heading", { name: "Ratio sits" })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Sit Brick Shooter on 2025-11-03",
      }),
    )

    expect(onApply).toHaveBeenCalledWith(suggestion)
  })
})
