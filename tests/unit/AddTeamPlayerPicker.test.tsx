// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AddTeamPlayerPicker,
  groupAddCandidatesByTeam,
} from "@/components/matchup/AddTeamPlayerPicker"
import type { SeasonPlayer } from "@/lib/season/types"

const projections: SeasonPlayer["projections"] = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 16,
}

const shooting = { FGM: 1, FGA: 2, FTM: 1, FTA: 1 }

const bosA: SeasonPlayer = {
  id: "bos-a",
  name: "Boston A",
  teamAbbr: "BOS",
  positions: ["SG"],
  projectedGames: 82,
  projections,
  shooting,
}

const bosB: SeasonPlayer = {
  id: "bos-b",
  name: "Boston B",
  teamAbbr: "BOS",
  positions: ["PG"],
  projectedGames: 82,
  projections,
  shooting,
}

const nyk: SeasonPlayer = {
  id: "nyk-1",
  name: "Knicks One",
  teamAbbr: "NYK",
  positions: ["SF"],
  projectedGames: 82,
  projections,
  shooting,
}

const freeAgent: SeasonPlayer = {
  id: "fa-1",
  name: "No Team",
  teamAbbr: "",
  positions: ["PF"],
  projectedGames: 82,
  projections,
  shooting,
}

afterEach(() => {
  cleanup()
})

describe("groupAddCandidatesByTeam", () => {
  it("groups by team, sorts teams and players, and puts FA last", () => {
    const groups = groupAddCandidatesByTeam([nyk, freeAgent, bosB, bosA])
    expect(groups.map((group) => group.team)).toEqual(["BOS", "NYK", "FA"])
    expect(groups[0]!.players.map((player) => player.name)).toEqual([
      "Boston A",
      "Boston B",
    ])
  })
})

describe("AddTeamPlayerPicker", () => {
  it("opens teams then shows players beside on team hover", () => {
    const onSelect = vi.fn(() => true)
    render(
      <AddTeamPlayerPicker
        ariaLabel="Stream add Mon spot 1"
        loadCandidates={() => [bosA, bosB, nyk]}
        onSelect={onSelect}
        value=""
        valueLabel="—"
      />,
    )

    expect(screen.queryByRole("listbox")).toBeNull()
    fireEvent.click(screen.getByRole("combobox", { name: /Stream add/i }))
    expect(screen.getByLabelText("Team BOS")).toBeInTheDocument()
    expect(screen.getByLabelText("Team NYK")).toBeInTheDocument()
    expect(screen.getByText(/Hover a team/i)).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByLabelText("Team BOS"))
    expect(screen.getByRole("option", { name: /Add Boston A/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Add Boston B/i })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Add Knicks One/i })).toBeNull()

    fireEvent.click(screen.getByRole("option", { name: /Add Boston A/i }))
    expect(onSelect).toHaveBeenCalledWith("bos-a")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("portals the open menu outside overflow parents", () => {
    render(
      <div style={{ height: 24, overflow: "hidden", width: 40 }}>
        <AddTeamPlayerPicker
          ariaLabel="Stream add Mon spot 1"
          loadCandidates={() => [bosA, nyk]}
          onSelect={() => true}
          value=""
          valueLabel="—"
        />
      </div>,
    )

    fireEvent.click(screen.getByRole("combobox", { name: /Stream add/i }))
    const listbox = screen.getByRole("listbox")
    expect(listbox.parentElement).toBe(document.body)
    expect(listbox.className).toMatch(/fixed/)
  })
})
