// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PlayerSchedulePanel } from "@/components/season/PlayerSchedulePanel"

describe("PlayerSchedulePanel", () => {
  it("renders games column and day headers with opponent labels", () => {
    render(
      <PlayerSchedulePanel
        matchup={{
          scoringPeriodId: 18,
          startDate: "2026-03-09",
          endDate: "2026-03-11",
          days: ["2026-03-09", "2026-03-10", "2026-03-11"],
        }}
        rows={[
          {
            slot: "PG",
            playerId: "p1",
            name: "Home Star",
            teamAbbr: "BOS",
            teamUnknown: false,
            games: 2,
            cells: {
              "2026-03-09": ["vs LAL"],
              "2026-03-10": ["@NYK", "@MIA"],
              "2026-03-11": [],
            },
          },
        ]}
      />,
    )

    expect(screen.getByRole("heading", { name: /player schedule/i })).toBeInTheDocument()
    expect(screen.getByText(/matchup/i)).toBeInTheDocument()
    expect(screen.getByText("Games")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("vs LAL")).toBeInTheDocument()
    expect(screen.getByText("@NYK")).toBeInTheDocument()
  })
})
