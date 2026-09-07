// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OpponentWeekStrip } from "@/components/matchup/OpponentWeekStrip"

describe("OpponentWeekStrip", () => {
  afterEach(() => cleanup())

  it("shows streamer name, dash on empty nights, and Auto open count", () => {
    const onOppSpotChoiceChange = vi.fn()
    render(
      <OpponentWeekStrip
        days={["2025-11-03", "2025-11-04"]}
        opponentName="Them"
        opponentDays={[
          {
            date: "2025-11-03",
            streamerPlayerId: "fa-b",
            rosterGameCount: 2,
          },
          {
            date: "2025-11-04",
            streamerPlayerId: null,
            rosterGameCount: 1,
          },
        ]}
        openSeatCount={2}
        oppSpotChoice="auto"
        onOppSpotChoiceChange={onOppSpotChoiceChange}
        playersById={{
          "fa-b": {
            id: "fa-b",
            name: "Opp Streamer",
            positions: ["PG"],
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 1,
              AST: 1,
              STL: 1,
              BLK: 1,
              TO: 1,
              PTS: 1,
            },
            shooting: { FGM: 1, FGA: 1, FTM: 1, FTA: 1 },
          },
        }}
      />,
    )
    expect(screen.getByText("Them")).toBeInTheDocument()
    expect(screen.getByText("Opp Streamer")).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Auto · 2 open/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: /^3$/ }))
    expect(onOppSpotChoiceChange).toHaveBeenCalledWith(3)
  })
})
