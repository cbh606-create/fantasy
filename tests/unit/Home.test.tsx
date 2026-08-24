// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Home from "@/app/page"

describe("Home", () => {
  it("renders athletic brand hero with matchup and mock draft CTAs", () => {
    render(<Home />)

    expect(
      screen.getByRole("heading", { name: "FANTASY" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open matchup" })).toHaveAttribute(
      "href",
      "/matchup",
    )
    expect(
      screen.getByRole("link", { name: "Start mock draft" }),
    ).toHaveAttribute("href", "/leagues/new")
    expect(screen.getByRole("link", { name: "Roster" })).toHaveAttribute(
      "href",
      "/roster",
    )
  })
})
