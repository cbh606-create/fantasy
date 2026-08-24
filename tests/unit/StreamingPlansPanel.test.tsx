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

  it("renders day rows with Hold Add Drop→Add and waiver links for adds", () => {
    render(
      <StreamingPlansPanel
        leagueId="lg1"
        playersById={{ "fa-a": streamerA, "fa-b": streamerB }}
        plans={[
          {
            spotCount: 1,
            addLimit: 7,
            addsUsed: 2,
            gameStarts: 3,
            days: [
              {
                date: "2025-11-03",
                cells: [{ spotIndex: 0, playerId: "fa-a", action: "add" }],
              },
              {
                date: "2025-11-04",
                cells: [{ spotIndex: 0, playerId: "fa-a", action: "hold" }],
              },
              {
                date: "2025-11-05",
                cells: [{ spotIndex: 0, playerId: "fa-b", action: "drop_add" }],
              },
              {
                date: "2025-11-06",
                cells: [{ spotIndex: 0, playerId: null, action: "empty" }],
              },
            ],
          },
          { spotCount: 2, addLimit: 7, addsUsed: 0, gameStarts: 0, days: [] },
          { spotCount: 3, addLimit: 7, addsUsed: 0, gameStarts: 0, days: [] },
        ]}
      />,
    )

    expect(screen.getByText("Add")).toBeInTheDocument()
    expect(screen.getByText("Hold")).toBeInTheDocument()
    expect(screen.getByText("Drop→Add")).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()

    const addLink = screen.getByRole("link", { name: /Streamer A/i })
    expect(addLink).toHaveAttribute(
      "href",
      "/waivers/lg1?addPlayerId=fa-a",
    )

    const dropAddLink = screen.getByRole("link", { name: /Streamer B/i })
    expect(dropAddLink).toHaveAttribute(
      "href",
      "/waivers/lg1?addPlayerId=fa-b",
    )

    expect(screen.getAllByText(/SG/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/BOS/).length).toBeGreaterThan(0)
  })
})
