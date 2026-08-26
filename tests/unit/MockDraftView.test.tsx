// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MockDraftView } from "@/components/draft/MockDraftView"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type { LeagueState, Player } from "@/lib/domain/types"

const projections = {
  FG_PCT: 0.45,
  FT_PCT: 0.8,
  TPM: 100,
  REB: 400,
  AST: 300,
  STL: 50,
  BLK: 20,
  TO: 150,
  PTS: 1200,
}

const players: Player[] = [
  {
    id: "a",
    name: "Alpha",
    positions: ["PG"],
    teamAbbr: "NYK",
    projections,
    adp: 1,
  },
]

const settings: LeagueState["settings"] = {
  teams: 4,
  draftType: "snake",
  rosterSlots: ["PG"],
  categories: defaultCategorySettings(),
  userPickSlot: 1,
  puntCategoryIds: [],
  focusCategoryIds: [],
  rounds: 1,
}

const state: LeagueState = {
  settings,
  board: buildEmptyBoard(settings.teams, settings.rounds),
  players,
  source: "manual",
  perspectiveTeamIndex: 0,
}

afterEach(() => {
  cleanup()
})

const renderView = () =>
  render(
    <MockDraftView
      isAdvancing={false}
      isSavingPick={false}
      latestPick={null}
      mockBoard={state.board}
      mockResult={null}
      onAdpSourceChange={vi.fn()}
      onMarkPicked={vi.fn()}
      onReset={vi.fn()}
      onSlotChange={vi.fn()}
      onTeamsChange={vi.fn()}
      perspectiveTeamIndex={0}
      players={players}
      state={state}
    />,
  )

describe("MockDraftView stats peek", () => {
  it("shows empty peek copy then projections after hovering a pool row", () => {
    renderView()

    expect(
      screen.getByText(/Hover a player to see projections/i),
    ).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText(/Alpha/).closest("tr")!)

    const peek = screen.getByLabelText(/player projections/i)
    expect(within(peek).getByText("PTS")).toBeInTheDocument()
    expect(within(peek).getByText("1200")).toBeInTheDocument()
  })
})
