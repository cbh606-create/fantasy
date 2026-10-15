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
    expect(document.querySelector("svg")).toBeNull()
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    expect(screen.getByText("Choose who to receive.")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "My Team" }).querySelector("svg")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Rivals" }).querySelector("svg")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    expect(screen.getByText("Choose who to send.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))

    expect(screen.getAllByText(/^Overall #/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/rank sum/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("REB").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/#\d+ → #\d+/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/package is larger/)).toBeNull()
    const advantage = screen.getByText(/Advantage .+ by \d+%|Packages are even/)
    const chart = document.querySelector("svg")
    expect(advantage.compareDocumentPosition(chart!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByRole("region", { name: "My Team" })).toHaveAttribute("data-shade")
    expect(screen.getByRole("region", { name: "Rivals" })).toHaveAttribute("data-shade")
    expect(screen.getByRole("rowheader", { name: "Send total" }).closest("tr"))
      .toHaveAttribute("data-side", "you")
    expect(screen.getByRole("rowheader", { name: "Receive total" }).closest("tr"))
      .toHaveAttribute("data-side", "them")
    expect(screen.getByRole("heading", { name: "Stats traded" })).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: "Difference" })).toBeInTheDocument()
  })

  it("does not show drop buttons until a sender is chosen", () => {
    render(<TradeSimulation state={fullState} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))

    expect(screen.queryByRole("button", { name: "Drop" })).toBeNull()
    expect(screen.getByText(/Choose who to send\.|to make this fair\./)).toBeInTheDocument()
  })

  it("waits for a drop when two players are received", () => {
    render(<TradeSimulation state={fullState} />)
    fireEvent.click(screen.getByRole("button", { name: "1:2" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

    expect(screen.getByText("Choose who to drop.")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "My Team" }).querySelector("svg")).toBeTruthy()

    const myRoster = within(screen.getByRole("group", { name: "My Team" }))
    expect(myRoster.getAllByRole("button", { name: "Drop" })).toHaveLength(2)
    fireEvent.click(myRoster.getAllByRole("button", { name: "Drop" })[0])
    expect(screen.getAllByText(/^Overall #/).length).toBeGreaterThan(0)
    expect(screen.getByText("Drops Your Big to open a roster spot")).toBeInTheDocument()
  })

  it("shows season totals under the charts after a complete package", () => {
    const quietBig = { ...yourBig, projections: { ...yourBig.projections, PTS: 0 } }
    const scored = stateOf([
      { ...yourGuard, projections: { ...yourGuard.projections, PTS: 820 }, projectedGames: 41 },
      quietBig,
    ])
    render(<TradeSimulation state={scored} />)

    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))

    const mine = screen.getByRole("region", { name: "My Team" })
    expect(within(mine).getByText(/^820\.0 →/)).toBeInTheDocument()
    expect(screen.queryByText(/^20\.0 →/)).toBeNull()
    expect(mine.querySelector("svg")).toBeTruthy()
  })

  it("clears the received player when the other team changes", () => {
    render(<TradeSimulation state={state} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    expect(screen.getByRole("button", { name: "Their Center" })).toHaveAttribute("aria-pressed", "true")

    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "2" } })

    expect(screen.queryByRole("button", { name: "Their Center" })).toBeNull()
    expect(screen.getByText("Choose who to receive.")).toBeInTheDocument()
  })

  it("does not add a third player on a full side", () => {
    render(<TradeSimulation state={fullState} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Stay" }))

    expect(screen.getByRole("button", { name: "Your Stay" })).toHaveAttribute("aria-pressed", "false")
  })

  it("completes a 1:1 package with one player each", () => {
    render(<TradeSimulation state={state} />)
    fireEvent.click(screen.getByRole("button", { name: "1:1" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))

    expect(screen.getAllByText(/^Overall #/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Advantage .+ by \d+%|Packages are even/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Your Big" })).toHaveAttribute("aria-pressed", "false")
  })

  it("allows three players on a 3:3 side", () => {
    const fourth = createPlayer("give-4", "Your Fourth", 10)
    render(<TradeSimulation state={stateOf([yourGuard, yourBig, yourStay, fourth])} />)
    fireEvent.click(screen.getByRole("button", { name: "3:3" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Stay" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Fourth" }))

    expect(screen.getByRole("button", { name: "Your Stay" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Your Fourth" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps a 2:3 send side to two players", () => {
    render(<TradeSimulation state={fullState} />)
    fireEvent.click(screen.getByRole("button", { name: "2:3" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Stay" }))

    expect(screen.getByRole("button", { name: "Your Guard" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Your Big" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Your Stay" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps a 1:2 send side to one player", () => {
    render(<TradeSimulation state={fullState} />)
    fireEvent.click(screen.getByRole("button", { name: "1:2" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Big" }))

    expect(screen.getByRole("button", { name: "Your Guard" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Your Big" })).toHaveAttribute("aria-pressed", "false")
  })

  it("recommends a player who fills the open slot fairly", () => {
    const even = stateOf([yourGuard, yourBig, yourStay])
    even.players = even.players.map((player) => ({
      ...player,
      projections: { ...baseProjections },
    }))
    render(<TradeSimulation state={even} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

    expect(screen.getByText("Add Your Big or Your Stay to make this fair.")).toBeInTheDocument()
  })

  it("gives the advantage to the team receiving the larger package", () => {
    const jokic = createPlayer("jokic", "Nikola Jokic", 10)
    const durant = createPlayer("durant", "Kevin Durant", 10)
    const traded = stateOf([jokic])
    traded.teams[1].entries = [{ slot: "UTIL", playerId: durant.id }]
    traded.players = [jokic, durant, fillerA, fillerB]
    render(<TradeSimulation state={traded} />)
    fireEvent.click(screen.getByRole("button", { name: "1:1" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Kevin Durant" }))
    fireEvent.click(screen.getByRole("button", { name: "Nikola Jokic" }))

    expect(screen.getByText(/^Advantage Rivals by \d+%$/)).toBeInTheDocument()
  })

  it("shows a cannot-fit sentence and no chart when the extra player has nowhere to go", () => {
    render(<TradeSimulation state={stateOf([yourGuard])} />)
    fireEvent.click(screen.getByRole("button", { name: "1:2" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Their Center" }))
    fireEvent.click(screen.getByRole("button", { name: "Their Wing" }))
    fireEvent.click(screen.getByRole("button", { name: "Your Guard" }))

    expect(screen.getByText("Your roster cannot fit the extra player.")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "My Team" }).querySelector("svg")).toBeTruthy()
  })
})
