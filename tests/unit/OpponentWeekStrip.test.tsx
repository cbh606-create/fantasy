// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { OpponentWeekStrip } from "@/components/matchup/OpponentWeekStrip"
import type { ScheduleResponse } from "@/lib/season/types"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 1,
  AST: 1,
  STL: 1,
  BLK: 1,
  TO: 1,
  PTS: 1,
}
const shooting = { FGM: 1, FGA: 1, FTM: 1, FTA: 1 }

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-04",
    days: ["2025-11-03", "2025-11-04"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "SAS", awayAbbr: "OKC" },
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
    { date: "2025-11-04", homeAbbr: "SAS", awayAbbr: "DET" },
  ],
}

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
            projections,
            shooting,
          },
          "opp-cut": {
            id: "opp-cut",
            name: "Opp Cut",
            positions: ["C"],
            projections,
            shooting,
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

  it("renders a read-only mini daily lineup without avatars", () => {
    render(
      <OpponentWeekStrip
        days={["2025-11-03", "2025-11-04"]}
        opponentDaily={{
          "2025-11-03": [
            { slot: "C", playerId: "opp-star" },
            { slot: "PG", playerId: "fa-b" },
          ],
          "2025-11-04": [{ slot: "C", playerId: "opp-star" }],
        }}
        opponentDays={[
          {
            date: "2025-11-03",
            streamerPlayerId: "fa-b",
            droppedPlayerId: null,
            rosterGameCount: 2,
            cells: [],
          },
          {
            date: "2025-11-04",
            streamerPlayerId: null,
            droppedPlayerId: null,
            rosterGameCount: 1,
            cells: [],
          },
        ]}
        opponentEntries={[
          { slot: "C", playerId: "opp-star" },
          { slot: "PG", playerId: null },
          { slot: "BE", playerId: null },
        ]}
        opponentName="Them"
        playersById={{
          "opp-star": {
            id: "opp-star",
            name: "Victor Wembanyama",
            teamAbbr: "SAS",
            positions: ["C"],
            projections,
            shooting,
          },
          "fa-b": {
            id: "fa-b",
            name: "Opp Streamer",
            teamAbbr: "BOS",
            positions: ["PG"],
            projections,
            shooting,
          },
        }}
        schedule={schedule}
      />,
    )

    expect(screen.getByText("Daily lineup · read-only")).toBeInTheDocument()
    expect(screen.getByText("Victor Wembanyama")).toBeInTheDocument()
    expect(screen.getByText("Opp Streamer")).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(
      screen.getByLabelText(/Victor Wembanyama starts .* v OKC/i),
    ).toHaveClass("bg-[var(--color-ink)]")
    expect(
      screen.getByLabelText(/Opp Streamer starts/i),
    ).toBeInTheDocument()

    const dayButtons = screen.getAllByRole("button", {
      name: /Highlight opp/i,
    })
    fireEvent.click(dayButtons[1]!)
    expect(dayButtons[1]).toHaveAttribute("aria-pressed", "true")
  })
})
