// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TradeSimulation } from "@/components/trade/TradeSimulation"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

afterEach(() => {
  cleanup()
})

const baseProjections: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 10,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const createPlayer = (id: string, name: string, reb: number): SeasonPlayer => {
  const projections = { ...baseProjections, REB: reb }

  return {
    id,
    name,
    projections,
    shooting: {
      FGM: projections.FG_PCT * 10,
      FGA: 10,
      FTM: projections.FT_PCT * 10,
      FTA: 10,
    },
  }
}

const yourGuard = createPlayer("give-1", "Your Guard", 4)
const yourBig = createPlayer("give-2", "Your Big", 20)
const yourStay = createPlayer("give-3", "Your Stay", 10)
const theirCenter = createPlayer("get-1", "Their Center", 20)
const theirWing = createPlayer("get-2", "Their Wing", 4)
const fillerA = createPlayer("fill-1", "Filler A", 10)
const fillerB = createPlayer("fill-2", "Filler B", 10)

const stateOf = (yourPlayers: SeasonPlayer[]): SeasonLeagueState => {
  const rosters = [
    { name: "My Team", players: yourPlayers },
    { name: "Rivals", players: [theirCenter, theirWing] },
    { name: "Filler", players: [fillerA, fillerB] },
  ]

  return {
    name: "Trade simulation league",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: rosters.map((roster, teamIndex) => ({
      teamIndex,
      name: roster.name,
      entries: roster.players.map((player) => ({
        slot: "UTIL" as const,
        playerId: player.id,
      })),
    })),
    players: rosters.flatMap((roster) => roster.players),
    availablePlayerIds: [],
    waiverOrder: [0, 1, 2],
    source: "manual",
  }
}

const state = stateOf([yourGuard, yourBig])
const fullState = stateOf([yourGuard, yourBig, yourStay])

describe("TradeSimulation", () => {
  it("shows overall and category ranks after both sides are chosen", () => {
    render(<TradeSimulation state={state} />)

    expect(screen.getByText("Choose another team.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Rivals" }))
    expect(screen.getByText("Choose who to receive.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    expect(screen.getByText("Choose who to send.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

    expect(screen.getAllByText(/^Overall #/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/rank sum/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("REB").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/#\d+ → #\d+/).length).toBeGreaterThan(0)
  })

  it("waits for a drop when two players are received", () => {
    render(<TradeSimulation state={fullState} />)
    fireEvent.click(screen.getByRole("button", { name: "Rivals" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

    expect(screen.getByText("Choose who to drop.")).toBeInTheDocument()
    expect(screen.queryByText(/^Overall #/)).toBeNull()

    fireEvent.click(
      within(screen.getByRole("group", { name: "Drop" })).getByRole("button", {
        name: "Your Big",
      }),
    )
    expect(screen.getAllByText(/^Overall #/).length).toBeGreaterThan(0)
    expect(screen.getByText("Drops Your Big to open a roster spot")).toBeInTheDocument()
  })
})
