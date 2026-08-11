// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlayerSchedulePanel } from "@/components/season/PlayerSchedulePanel"

describe("PlayerSchedulePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it("renders duplicate roster entries and opponent labels without React key warnings", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const duplicateRow = {
      slot: "UTIL" as const,
      playerId: "p1",
      name: "Home Star",
      teamAbbr: "BOS",
      teamUnknown: false,
      games: 2,
      cells: {
        "2026-03-09": ["vs LAL", "vs LAL"],
      },
    }

    render(
      <PlayerSchedulePanel
        matchup={{
          scoringPeriodId: 18,
          startDate: "2026-03-09",
          endDate: "2026-03-09",
          days: ["2026-03-09"],
        }}
        rows={[duplicateRow, duplicateRow]}
      />,
    )

    const consoleErrors = consoleErrorSpy.mock.calls.flat().join(" ")
    expect(consoleErrors).not.toMatch(/same key|unique "key"/i)
  })
})
