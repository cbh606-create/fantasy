// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/components/ui/Button"

describe("Button", () => {
  it("renders a primary button", () => {
    render(<Button variant="primary">Start draft</Button>)

    expect(screen.getByRole("button", { name: "Start draft" })).toBeInTheDocument()
  })
})
