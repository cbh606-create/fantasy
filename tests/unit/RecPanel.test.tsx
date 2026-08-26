// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RecPanel } from "@/components/draft/RecPanel"
import type { Player, SimulationResult } from "@/lib/domain/types"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 7,
  AST: 5,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 20,
}

const players: Player[] = [
  { id: "a", name: "Alpha", positions: ["PG"], projections, adp: 1 },
  { id: "b", name: "Bravo", positions: ["SG"], projections, adp: 2 },
  { id: "c", name: "Charlie", positions: ["SF"], projections, adp: 3 },
  { id: "d", name: "Delta", positions: ["PF"], projections, adp: 4 },
]

const result: SimulationResult = {
  nextPicks: [
    { playerId: "a", score: 1, frequency: 0.5 },
    { playerId: "b", score: 0.9, frequency: 0.3 },
    { playerId: "c", score: 0.8, frequency: 0.15 },
    { playerId: "d", score: 0.7, frequency: 0.05 },
  ],
  topCombinations: [],
  categoryOutlook: {
    FG_PCT: 0.1,
    FT_PCT: 0.1,
    TPM: 0.1,
    REB: 0.1,
    AST: 0.1,
    STL: 0.1,
    BLK: 0.1,
    TO: -0.1,
    PTS: 0.1,
  },
  meta: {
    simCount: 10,
    seed: 1,
    generatedAt: "2026-08-18T00:00:00.000Z",
    latencyMs: 1,
    source: "manual",
  },
}

afterEach(() => cleanup())

describe("RecPanel", () => {
  it("limits next picks when maxNextPicks is set", () => {
    render(
      <RecPanel
        maxNextPicks={3}
        players={players}
        result={result}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    expect(screen.getByText("Charlie")).toBeInTheDocument()
    expect(screen.queryByText("Delta")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /category outlook/i })).not.toBeInTheDocument()
  })

  it("shows category outlook by default", () => {
    render(<RecPanel players={players} result={result} />)

    expect(screen.getByRole("heading", { name: /category outlook/i })).toBeInTheDocument()
    expect(screen.getByText("Delta")).toBeInTheDocument()
  })

  it("shows simulating copy when loading without a result", () => {
    render(
      <RecPanel
        emptyMessage="Waiting for your turn…"
        isSimulating
        players={players}
        result={null}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByText(/simulating/i)).toBeInTheDocument()
  })

  it("shows approximate frequencies and sim count", () => {
    render(
      <RecPanel
        maxNextPicks={3}
        players={players}
        result={result}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByText("~50%")).toBeInTheDocument()
    expect(screen.getByText("~30%")).toBeInTheDocument()
    expect(screen.getByText(/Based on 10 sims/i)).toBeInTheDocument()
  })

  it("renders a horizontal row layout without outlook", () => {
    render(
      <RecPanel
        layout="row"
        maxNextPicks={3}
        players={players}
        result={result}
        showCategoryOutlook={false}
      />,
    )

    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /category outlook/i })).not.toBeInTheDocument()
  })
})
