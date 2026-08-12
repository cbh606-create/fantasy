// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Home from "@/app/page"

describe("Home", () => {
  it("renders matchup-first hero with draft prep secondary", () => {
    render(<Home />)

    expect(
      screen.getByRole("heading", { name: "FANTASY" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Open matchup advisor" }),
    ).toHaveAttribute("href", "/matchup")
    expect(
      screen.getByRole("link", { name: "Start draft prep" }),
    ).toHaveAttribute("href", "/leagues/new")
  })
})
