// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { StatPairTable } from "@/components/matchup/StatPairTable"
import type { StatPairRow } from "@/lib/players/statPairCorrelation"

const measuredRow: StatPairRow = {
  categoryA: "AST",
  categoryB: "PTS",
  r: -0.456,
  penalty: 0.0684,
  n: 42,
  measured: true,
}

const unmeasuredRow: StatPairRow = {
  categoryA: "REB",
  categoryB: "STL",
  r: 0,
  penalty: 0,
  n: 18,
  measured: false,
}

describe("StatPairTable", () => {
  afterEach(() => cleanup())

  it("renders an empty sample and the Stat pairs summary", () => {
    render(<StatPairTable rows={[]} />)

    expect(screen.getByText("Stat pairs")).toBeInTheDocument()
    expect(screen.getByText("No stat-pair sample yet")).toBeInTheDocument()
  })

  it("shows measured r to 2 decimals and penalty to 3 decimals", () => {
    render(<StatPairTable rows={[measuredRow]} />)

    expect(screen.getByText("-0.46")).toBeInTheDocument()
    expect(screen.getByText("0.068")).toBeInTheDocument()
  })

  it("shows an em dash for unmeasured r and penalty and still shows n", () => {
    render(<StatPairTable rows={[unmeasuredRow]} />)

    const dashes = screen.getAllByText("—")
    expect(dashes).toHaveLength(2)
    expect(screen.getByText("18")).toBeInTheDocument()
  })
})
