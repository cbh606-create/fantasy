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
  projectedGames: 80,
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
  it("keeps category labels and row labels when empty", () => {
    render(<PlayerStatsPeek player={null} />)
    expect(
      screen.getByText(/Hover a player to see projections/i),
    ).toBeInTheDocument()
    expect(screen.getByText("PTS")).toBeInTheDocument()
    expect(screen.getByText("GP")).toBeInTheDocument()
    expect(screen.getByText("Season")).toBeInTheDocument()
    expect(screen.getByText("Per game")).toBeInTheDocument()
  })

  it("divides counting stats by projectedGames, not a fixed 82", () => {
    render(<PlayerStatsPeek player={player} />)
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("80")).toBeInTheDocument()
    expect(screen.getByText("1200")).toBeInTheDocument()
    expect(screen.getByText("15.0")).toBeInTheDocument() // 1200/80
    expect(screen.queryByText((1200 / 82).toFixed(1))).not.toBeInTheDocument()
    expect(screen.getAllByText("0.450")).toHaveLength(2)
  })

  it("shows em dash for per-game counts when projectedGames is missing", () => {
    const { projectedGames: _ignored, ...withoutGp } = player
    render(<PlayerStatsPeek player={withoutGp} />)
    expect(screen.getByText("1200")).toBeInTheDocument()
    expect(screen.queryByText("15.0")).not.toBeInTheDocument()
    expect(screen.getAllByText("0.450")).toHaveLength(2)
  })

  it("shows an em dash when teamAbbr is missing", () => {
    render(<PlayerStatsPeek player={{ ...player, teamAbbr: undefined }} />)
    const peek = screen.getByLabelText(/player projections/i)
    expect(peek).toHaveTextContent("—")
    expect(peek).not.toHaveTextContent("??")
  })

  it("badges punted and focused category headers", () => {
    render(
      <PlayerStatsPeek
        focusCategoryIds={["STL"]}
        player={player}
        puntCategoryIds={["TO"]}
      />,
    )
    expect(screen.getByLabelText("TO Punt")).toBeInTheDocument()
    expect(screen.getByLabelText("STL Focus")).toBeInTheDocument()
    expect(screen.getByLabelText("PTS")).toBeInTheDocument()
    expect(screen.queryByLabelText("PTS Punt")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("PTS Focus")).not.toBeInTheDocument()
  })

  it("omits strategy badges when both lists are empty", () => {
    render(<PlayerStatsPeek player={player} />)
    expect(screen.queryByText("Punt")).not.toBeInTheDocument()
    expect(screen.queryByText("Focus")).not.toBeInTheDocument()
  })
})
