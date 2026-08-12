// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SeasonModuleNav } from "@/components/SeasonModuleNav"

afterEach(() => {
  cleanup()
})

describe("SeasonModuleNav", () => {
  it("renders five module links with active matchup and roster href for league", () => {
    render(<SeasonModuleNav current="matchup" leagueId="league-42" />)

    expect(screen.getByRole("navigation", { name: "Season modules" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Matchup" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: "Roster" })).toHaveAttribute(
      "href",
      "/roster/league-42",
    )
    expect(screen.getByRole("link", { name: "Trade" })).toHaveAttribute(
      "href",
      "/trade/league-42",
    )
    expect(screen.getByRole("link", { name: "Waivers" })).toHaveAttribute(
      "href",
      "/waivers/league-42",
    )
    expect(screen.getByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      "/leagues/new",
    )
    expect(screen.getByRole("link", { name: "Matchup" })).toHaveAttribute(
      "href",
      "/matchup/league-42",
    )
  })
})
