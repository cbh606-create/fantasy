// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"
import type { SeasonPlayer } from "@/lib/season/types"

const projections: SeasonPlayer["projections"] = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
}

const streamerA: SeasonPlayer = {
  id: "fa-a",
  name: "Streamer A",
  teamAbbr: "BOS",
  positions: ["SG"],
  projections,
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
}

const streamerB: SeasonPlayer = {
  id: "fa-b",
  name: "Streamer B",
  teamAbbr: "NYK",
  positions: ["PG"],
  projections,
  shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
}

describe("StreamingPlansPanel", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders 1-spot 2-spot and 3-spot plan headings with add summary", () => {
    render(
      <StreamingPlansPanel
        leagueId="lg1"
        playersById={{ "fa-a": streamerA }}
        plans={[
          { spotCount: 1, addLimit: 7, addsUsed: 3, gameStarts: 5, days: [] },
          { spotCount: 2, addLimit: 7, addsUsed: 5, gameStarts: 8, days: [] },
          { spotCount: 3, addLimit: 7, addsUsed: 7, gameStarts: 10, days: [] },
        ]}
      />,
    )

    expect(
      screen.getByRole("heading", { name: /streaming plans/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1-spot/i)).toBeInTheDocument()
    expect(screen.getByText(/2-spot/i)).toBeInTheDocument()
    expect(screen.getByText(/3-spot/i)).toBeInTheDocument()
    expect(screen.getByText(/Adds 3\/7/i)).toBeInTheDocument()
    expect(screen.getByText(/Adds 5\/7/i)).toBeInTheDocument()
    expect(screen.getByText(/Adds 7\/7/i)).toBeInTheDocument()
  })

  it("renders day column headers and Drop / Add / Roster lines", () => {
    const rostered: SeasonPlayer = {
      id: "you-1",
      name: "Roster Cut",
      teamAbbr: "CHI",
      positions: ["PF"],
      projections,
      shooting: { FGM: 1, FGA: 2, FTM: 1, FTA: 1 },
    }

    render(
      <StreamingPlansPanel
        leagueId="lg1"
        playersById={{
          "fa-a": streamerA,
          "fa-b": streamerB,
          "you-1": rostered,
        }}
        plans={[
          {
            spotCount: 1,
            addLimit: 7,
            addsUsed: 2,
            gameStarts: 3,
            days: [
              {
                date: "2025-11-03",
                cells: [
                  {
                    spotIndex: 0,
                    playerId: "fa-a",
                    action: "add",
                    droppedPlayerId: null,
                    rosterDropPlayerId: "you-1",
                    rosterDropKind: "player",
                  },
                ],
              },
              {
                date: "2025-11-04",
                cells: [
                  {
                    spotIndex: 0,
                    playerId: "fa-a",
                    action: "hold",
                    droppedPlayerId: null,
                    rosterDropPlayerId: null,
                    rosterDropKind: "none",
                  },
                ],
              },
              {
                date: "2025-11-05",
                cells: [
                  {
                    spotIndex: 0,
                    playerId: "fa-b",
                    action: "drop_add",
                    droppedPlayerId: "fa-a",
                    rosterDropPlayerId: null,
                    rosterDropKind: "open_slot",
                  },
                ],
              },
            ],
          },
          { spotCount: 2, addLimit: 7, addsUsed: 0, gameStarts: 0, days: [] },
          { spotCount: 3, addLimit: 7, addsUsed: 0, gameStarts: 0, days: [] },
        ]}
      />,
    )

    expect(screen.getByText(/Mon/i)).toBeInTheDocument()
    expect(screen.getByText(/Spot 1/i)).toBeInTheDocument()
    expect(
      screen.getByRole("cell", { name: /Add Streamer A/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Drop Streamer A/i)).toBeInTheDocument()
    expect(screen.getByText(/Roster: drop Roster Cut/i)).toBeInTheDocument()
    expect(screen.getByText(/Roster: open slot/i)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Streamer A/i }),
    ).toHaveAttribute("href", "/waivers/lg1?addPlayerId=fa-a")
    expect(
      screen.getByRole("link", { name: /Streamer B/i }),
    ).toHaveAttribute("href", "/waivers/lg1?addPlayerId=fa-b")
    expect(screen.getAllByRole("link", { name: /Streamer A/i })).toHaveLength(1)
  })
})
