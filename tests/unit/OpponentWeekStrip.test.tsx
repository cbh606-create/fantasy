// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  OpponentWeekStrip,
  opponentRosteredDatesByPlayerId,
} from "@/components/matchup/OpponentWeekStrip"
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

  it("shows a drop-only waiver move instead of a dash", () => {
    render(
      <OpponentWeekStrip
        days={["2025-11-03"]}
        opponentName="Them"
        opponentDays={[
          {
            date: "2025-11-03",
            streamerPlayerId: null,
            droppedPlayerId: "opp-cut",
            rosterGameCount: 1,
            cells: [
              {
                spotIndex: 0,
                playerId: null,
                droppedPlayerId: "opp-cut",
                action: "empty",
                addIndex: null,
              },
            ],
          },
        ]}
        playersById={{
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

    expect(screen.getByLabelText(/Opp .* spot 1: Opp Cut/i)).toBeInTheDocument()
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

    expect(
      screen.getByText(/Sit a game to simulate an injury or B2B/i),
    ).toBeInTheDocument()
    expect(screen.getByText("Victor Wembanyama")).toBeInTheDocument()
    expect(screen.getByText("Opp Streamer")).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: /Sit Victor Wembanyama/i })[0],
    ).toHaveClass("bg-[var(--color-ink)]")
    expect(
      screen.getByRole("button", { name: /Sit Opp Streamer/i }),
    ).toBeInTheDocument()

    const dayButtons = screen.getAllByRole("button", {
      name: /Highlight opp/i,
    })
    fireEvent.click(dayButtons[1]!)
    expect(dayButtons[1]).toHaveAttribute("aria-pressed", "true")
  })

  it("sits an opponent game and marks an injured player out", () => {
    const onTogglePlayerDay = vi.fn(() => "sat" as const)
    render(
      <OpponentWeekStrip
        days={["2025-11-03"]}
        onTogglePlayerDay={onTogglePlayerDay}
        opponentDaily={{
          "2025-11-03": [{ slot: "C", playerId: "opp-star" }],
        }}
        opponentDays={[]}
        opponentEntries={[
          { slot: "C", playerId: "opp-star" },
          { slot: "PG", playerId: "opp-out" },
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
          "opp-out": {
            id: "opp-out",
            name: "Out Guard",
            teamAbbr: "BOS",
            injuryStatus: "out",
            positions: ["PG"],
            projections,
            shooting,
          },
        }}
        schedule={schedule}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: /Sit Victor Wembanyama/i }),
    )
    expect(onTogglePlayerDay).toHaveBeenCalledWith("opp-star", "2025-11-03")
    expect(screen.getByLabelText(/Out Guard out/i)).toHaveTextContent("OUT")
    expect(
      screen.queryByRole("button", { name: /Out Guard/i }),
    ).not.toBeInTheDocument()
  })

  it("grays game toggles on days a swap leaves the player off the roster", () => {
    const onTogglePlayerDay = vi.fn(() => "sat" as const)
    const swapSchedule: ScheduleResponse = {
      ...schedule,
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "NYK" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: "2025-11-03", homeAbbr: "SAS", awayAbbr: "OKC" },
        { date: "2025-11-04", homeAbbr: "SAS", awayAbbr: "DET" },
      ],
    }
    render(
      <OpponentWeekStrip
        days={["2025-11-03", "2025-11-04"]}
        onTogglePlayerDay={onTogglePlayerDay}
        opponentDaily={{
          "2025-11-03": [{ slot: "C", playerId: "opp-star" }],
          "2025-11-04": [{ slot: "PG", playerId: "fa-b" }],
        }}
        opponentDays={[
          {
            date: "2025-11-03",
            streamerPlayerId: null,
            droppedPlayerId: null,
            rosterGameCount: 1,
            cells: [],
          },
          {
            date: "2025-11-04",
            streamerPlayerId: "fa-b",
            droppedPlayerId: "opp-star",
            rosterGameCount: 1,
            cells: [
              {
                spotIndex: 0,
                playerId: "fa-b",
                droppedPlayerId: "opp-star",
                action: "drop_add",
                addIndex: 1,
              },
            ],
          },
        ]}
        opponentEntries={[
          { slot: "C", playerId: "opp-star" },
          { slot: "PG", playerId: null },
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
        schedule={swapSchedule}
      />,
    )

    const beforeAdd = screen.getByRole("button", {
      name: /Opp Streamer not on roster/i,
    })
    expect(beforeAdd).toBeDisabled()
    expect(beforeAdd.className).toContain("text-[var(--color-mute)]")
    fireEvent.click(beforeAdd)
    expect(onTogglePlayerDay).not.toHaveBeenCalled()

    expect(
      screen.getByRole("button", { name: /Sit Opp Streamer/i }),
    ).toBeEnabled()

    const afterDrop = screen.getAllByRole("button", {
      name: /Victor Wembanyama not on roster/i,
    })
    expect(afterDrop.length).toBeGreaterThan(0)
    expect(afterDrop[0]).toBeDisabled()
    expect(afterDrop[0]?.className).toContain("opacity-70")
    expect(
      screen.getByRole("button", { name: /Sit Victor Wembanyama/i }),
    ).toBeEnabled()
  })

  it("drops a roster player when the stream uses the espn- alias", () => {
    const days = ["2026-10-21", "2026-10-23"]
    const dates = opponentRosteredDatesByPlayerId(
      days,
      [{ slot: "C", playerId: "5061589" }],
      [
        {
          date: "2026-10-21",
          streamerPlayerId: "espn-5061589",
          droppedPlayerId: null,
          rosterGameCount: 1,
          cells: [
            {
              spotIndex: 0,
              playerId: "espn-5061589",
              droppedPlayerId: null,
              action: "add",
              addIndex: 1,
            },
          ],
        },
        {
          date: "2026-10-23",
          streamerPlayerId: "whitmore",
          droppedPlayerId: "espn-5061589",
          rosterGameCount: 1,
          cells: [
            {
              spotIndex: 0,
              playerId: "whitmore",
              droppedPlayerId: "espn-5061589",
              action: "drop_add",
              addIndex: 2,
            },
          ],
        },
      ],
    )
    expect(dates.get("5061589")?.has("2026-10-21")).toBe(true)
    expect(dates.get("5061589")?.has("2026-10-23")).toBe(false)
  })
})
