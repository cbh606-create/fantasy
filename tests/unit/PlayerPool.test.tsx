// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlayerPool } from "@/components/draft/PlayerPool"
import type { Player } from "@/lib/domain/types"

const projections = {
  FG_PCT: 0.45,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 0.5,
  TO: 2,
  PTS: 15,
}

const players: Player[] = [
  {
    id: "a",
    name: "Zed Player",
    positions: ["C"],
    projections,
    adp: 3,
  },
  {
    id: "b",
    name: "Amy Player",
    positions: ["PG"],
    projections,
    adp: 1,
  },
  {
    id: "c",
    name: "Mia Player",
    positions: ["SF"],
    projections,
    adp: 2,
  },
]

afterEach(() => {
  cleanup()
})

const rowNames = () =>
  screen
    .getAllByRole("button", { name: /Mark .+ picked/ })
    .map((button) =>
      button.getAttribute("aria-label")?.replace(/^Mark | picked$/g, "") ?? "",
    )

describe("PlayerPool compact sorting", () => {
  it("defaults to ADP ascending and toggles on header click", () => {
    render(
      <PlayerPool
        compact
        onMarkPicked={vi.fn()}
        pickedPlayerIds={[]}
        players={players}
      />,
    )

    expect(rowNames()).toEqual(["Amy Player", "Mia Player", "Zed Player"])

    fireEvent.click(screen.getByRole("button", { name: "Sort by ADP" }))
    expect(rowNames()).toEqual(["Zed Player", "Mia Player", "Amy Player"])

    fireEvent.click(screen.getByRole("button", { name: "Sort by Player" }))
    expect(rowNames()).toEqual(["Amy Player", "Mia Player", "Zed Player"])

    fireEvent.click(screen.getByRole("button", { name: "Sort by Pos" }))
    expect(rowNames()).toEqual(["Zed Player", "Amy Player", "Mia Player"])
  })

  it("does not expand inline stats and reports hover id", () => {
    const onHoverPlayerId = vi.fn()
    render(
      <PlayerPool
        compact
        onHoverPlayerId={onHoverPlayerId}
        onMarkPicked={vi.fn()}
        pickedPlayerIds={[]}
        players={players}
      />,
    )

    const row = screen.getByText(/Amy Player/).closest("tr")!
    fireEvent.mouseEnter(row)
    expect(onHoverPlayerId).toHaveBeenCalledWith("b")
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.mouseLeave(row)
    expect(onHoverPlayerId).toHaveBeenCalledWith(null)
  })
})
