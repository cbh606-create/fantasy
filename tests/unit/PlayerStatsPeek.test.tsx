// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PlayerStatsPeek } from "@/components/draft/PlayerStatsPeek"
import type { Player } from "@/lib/domain/types"

const player: Player = {
  id: "a",
  name: "Alpha",
  positions: ["PG"],
  teamAbbr: "NYK",
  projections: {
    FG_PCT: 0.45,
    FT_PCT: 0.8,
    TPM: 100,
    REB: 400,
    AST: 300,
    STL: 50,
    BLK: 20,
    TO: 150,
    PTS: 1200,
  },
  adp: 1,
}

afterEach(() => cleanup())

describe("PlayerStatsPeek", () => {
  it("shows empty copy when no player", () => {
    render(<PlayerStatsPeek player={null} />)
    expect(
      screen.getByText(/Hover a player to see projections/i),
    ).toBeInTheDocument()
  })

  it("shows nine-cat projections for the player", () => {
    render(<PlayerStatsPeek player={player} />)
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("PTS")).toBeInTheDocument()
    expect(screen.getByText("1200")).toBeInTheDocument()
    expect(screen.getByText("0.450")).toBeInTheDocument()
  })
})
