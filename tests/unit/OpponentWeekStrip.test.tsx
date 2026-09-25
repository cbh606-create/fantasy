// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { OpponentWeekStrip } from "@/components/matchup/OpponentWeekStrip"

describe("OpponentWeekStrip", () => {
  afterEach(() => cleanup())

  it("shows streamer name, add ordinal, and dash on empty nights", () => {
    render(
      <OpponentWeekStrip
        days={["2025-11-03", "2025-11-04"]}
        opponentName="Them"
        opponentDays={[
          {
            date: "2025-11-03",
            streamerPlayerId: "fa-b",
            droppedPlayerId: "opp-cut",
            rosterGameCount: 2,
            cells: [
              {
                spotIndex: 0,
                playerId: "fa-b",
                droppedPlayerId: "opp-cut",
                action: "add",
                addIndex: 1,
              },
            ],
          },
          {
            date: "2025-11-04",
            streamerPlayerId: null,
            droppedPlayerId: null,
            rosterGameCount: 1,
            cells: [
              {
                spotIndex: 0,
                playerId: null,
                droppedPlayerId: null,
                action: "empty",
                addIndex: null,
              },
            ],
          },
        ]}
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
          "opp-cut": {
            id: "opp-cut",
            name: "Opp Cut",
            positions: ["C"],
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
    expect(screen.getByText("Opp Cut → Opp Streamer")).toBeInTheDocument()
    expect(screen.getByLabelText("Opp add 1")).toHaveTextContent("1")
    expect(screen.getByLabelText(/Opp .* spot 1: —/i)).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: /^Stream$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Opp .* 2 games/i)).toHaveClass(
      "w-20",
      "min-w-20",
      "max-w-20",
    )
  })
})
