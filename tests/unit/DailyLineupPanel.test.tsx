// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DailyLineupPanel } from "@/components/matchup/DailyLineupPanel"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type { ScheduleResponse, SeasonPlayer } from "@/lib/season/types"

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

const rostered: SeasonPlayer = {
  id: "you-1",
  name: "Roster Cut",
  teamAbbr: "CHI",
  positions: ["PF"],
  projections,
  shooting,
}

const streamer: SeasonPlayer = {
  id: "fa-a",
  name: "Streamer A",
  teamAbbr: "BOS",
  positions: ["SG"],
  projections,
  shooting,
}

const days = ["2025-11-03", "2025-11-04"]

const daily: DailyLineups = {
  "2025-11-03": [{ slot: "UTIL", playerId: "you-1" }],
  "2025-11-04": [{ slot: "UTIL", playerId: "you-1" }],
}

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-04",
    days,
  },
  games: [
    { date: "2025-11-03", homeAbbr: "CHI", awayAbbr: "WAS" },
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "ORL" },
    { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "MIA" },
    { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "NYK" },
  ],
}

describe("DailyLineupPanel sit/start badges", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows sit/start hint on the player's game cells", () => {
    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
        sitStartBadgesByPlayerId={{ "you-1": "Start over Streamer A" }}
      />,
    )

    const hints = screen.getAllByText("Start over Streamer A")
    expect(hints.length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole("button", {
        name: /Start over Streamer A/i,
      }).length,
    ).toBeGreaterThan(0)
  })
})

describe("DailyLineupPanel game count row", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows started game counts per day at the top of the table", () => {
    const twoDayDaily: DailyLineups = {
      "2025-11-03": [
        { slot: "UTIL", playerId: "you-1" },
        { slot: "SG", playerId: "fa-a" },
      ],
      "2025-11-04": [{ slot: "UTIL", playerId: "you-1" }],
    }

    render(
      <DailyLineupPanel
        daily={twoDayDaily}
        days={days}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    expect(screen.getByRole("rowheader", { name: "Games" })).toBeInTheDocument()
    expect(screen.getByLabelText(/^2 games /)).toHaveTextContent("2")
    expect(screen.getByLabelText(/^1 games /)).toHaveTextContent("1")
  })
})

describe("DailyLineupPanel preview overlay", () => {
  afterEach(() => {
    cleanup()
  })

  it("allows roster start/sit toggles while preview is active", () => {
    const onTogglePlayerDay = vi.fn(() => "sat" as const)

    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        onReset={vi.fn()}
        onTogglePlayerDay={onTogglePlayerDay}
        previewActive
        previewSpotCount={1}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    fireEvent.click(
      screen.getAllByRole("button", { name: /Sit Roster Cut on/i })[0]!,
    )

    expect(onTogglePlayerDay).toHaveBeenCalledWith("you-1", "2025-11-03")
  })

  it("allows preview streamer start/sit toggles", () => {
    const onTogglePlayerDay = vi.fn(() => "sat" as const)

    render(
      <DailyLineupPanel
        daily={{
          ...daily,
          "2025-11-03": [
            { slot: "UTIL", playerId: "you-1" },
            { slot: "SG", playerId: "fa-a" },
          ],
        }}
        days={days}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={onTogglePlayerDay}
        previewActive
        previewPlayerIds={["fa-a"]}
        previewSpotCount={1}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
        streamerOwnedDatesByPlayerId={{ "fa-a": ["2025-11-03", "2025-11-04"] }}
      />,
    )

    fireEvent.click(
      screen.getAllByRole("button", { name: /Sit Streamer A on/i })[0]!,
    )

    expect(onTogglePlayerDay).toHaveBeenCalledWith("fa-a", "2025-11-03")
  })

  it("shows preview banner and streamer badge while previewing", () => {
    render(
      <DailyLineupPanel
        daily={{
          ...daily,
          "2025-11-03": [
            { slot: "UTIL", playerId: "you-1" },
            { slot: "SG", playerId: "fa-a" },
          ],
        }}
        days={days}
        droppedFromDateByPlayerId={{ "you-1": "2025-11-03" }}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        previewActive
        previewPlayerIds={["fa-a"]}
        previewSpotCount={1}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    expect(
      screen.getByText(
        /Previewing 1-spot plan — streamers overlay; start\/sit roster or preview streamers/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Streamer A")).toBeInTheDocument()
    expect(screen.getByText("preview")).toBeInTheDocument()
  })

  it("mutes dropped roster names during preview", () => {
    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        droppedFromDateByPlayerId={{ "you-1": "2025-11-04" }}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        previewActive
        previewSpotCount={2}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    const name = screen.getByText("Roster Cut")
    expect(name.className).toMatch(/line-through/)
  })

  it("locks game cells only on and after the plan drop date", () => {
    const onTogglePlayerDay = vi.fn(() => "sat" as const)

    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        droppedFromDateByPlayerId={{ "you-1": "2025-11-04" }}
        onReset={vi.fn()}
        onTogglePlayerDay={onTogglePlayerDay}
        previewActive
        previewSpotCount={1}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    const beforeDrop = screen.getByRole("button", {
      name: /Sit Roster Cut on/i,
    })
    expect(beforeDrop).not.toBeDisabled()
    fireEvent.click(beforeDrop)
    expect(onTogglePlayerDay).toHaveBeenCalledWith("you-1", "2025-11-03")

    const afterDrop = screen.getByRole("button", {
      name: /Roster Cut dropped in streaming plan on/i,
    })
    expect(afterDrop).toBeDisabled()
    expect(afterDrop.className).toMatch(/bg-\[var\(--color-soft-cloud\)\]/)
    fireEvent.click(afterDrop)
    expect(onTogglePlayerDay).toHaveBeenCalledTimes(1)
  })

  it("locks streamer game cells outside plan-owned dates", () => {
    const onTogglePlayerDay = vi.fn(() => "sat" as const)

    render(
      <DailyLineupPanel
        daily={{
          ...daily,
          "2025-11-04": [
            { slot: "UTIL", playerId: "you-1" },
            { slot: "SG", playerId: "fa-a" },
          ],
        }}
        days={days}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={onTogglePlayerDay}
        previewActive
        previewPlayerIds={["fa-a"]}
        previewSpotCount={1}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
        streamerOwnedDatesByPlayerId={{ "fa-a": ["2025-11-04"] }}
      />,
    )

    const beforeAdd = screen.getByRole("button", {
      name: /Streamer A not on streaming plan on/i,
    })
    expect(beforeAdd).toBeDisabled()
    expect(beforeAdd.className).toMatch(/bg-\[var\(--color-soft-cloud\)\]/)
    fireEvent.click(beforeAdd)
    expect(onTogglePlayerDay).not.toHaveBeenCalled()

    const onPlan = screen.getByRole("button", {
      name: /Sit Streamer A on/i,
    })
    expect(onPlan).not.toBeDisabled()
    fireEvent.click(onPlan)
    expect(onTogglePlayerDay).toHaveBeenCalledWith("fa-a", "2025-11-04")
  })
})

describe("DailyLineupPanel IL game cells", () => {
  afterEach(() => {
    cleanup()
  })

  it("shades IR game cells and blocks start/sit without calling toggle", () => {
    const onTogglePlayerDay = vi.fn()
    const injured: SeasonPlayer = {
      ...rostered,
      id: "il-1",
      name: "Injured Star",
      teamAbbr: "CHI",
    }

    render(
      <DailyLineupPanel
        daily={{
          "2025-11-03": [{ slot: "UTIL", playerId: null }],
          "2025-11-04": [{ slot: "UTIL", playerId: null }],
        }}
        days={days}
        ilPlayerIds={["il-1"]}
        onReset={vi.fn()}
        onTogglePlayerDay={onTogglePlayerDay}
        rosterEntries={[{ slot: "IL", playerId: "il-1" }]}
        rosterPlayers={[injured]}
        schedule={schedule}
      />,
    )

    const irCells = screen.getAllByRole("button", {
      name: /Injured Star on IR/i,
    })
    expect(irCells.length).toBeGreaterThan(0)
    expect(irCells[0]!.className).toMatch(/bg-\[var\(--color-soft-cloud\)\]/)
    expect(irCells[0]!).toHaveTextContent("IR")
    fireEvent.click(irCells[0]!)
    expect(onTogglePlayerDay).not.toHaveBeenCalled()
    expect(screen.getByText(/On IR — move off IL on Roster to start/i)).toBeInTheDocument()
  })
})

describe("DailyLineupPanel slot column and day sort", () => {
  afterEach(() => {
    cleanup()
  })

  const pg: SeasonPlayer = {
    ...rostered,
    id: "pg-1",
    name: "Point Guard",
    positions: ["PG"],
  }
  const bench: SeasonPlayer = {
    ...rostered,
    id: "be-1",
    name: "Bench Wing",
    positions: ["SF"],
  }
  const center: SeasonPlayer = {
    ...rostered,
    id: "c-1",
    name: "The Center",
    positions: ["C"],
  }

  it("keeps fixed PG→Bench slot rows even when only a later slot is filled", () => {
    render(
      <DailyLineupPanel
        daily={{
          "2025-11-03": [{ slot: "C", playerId: "c-1" }],
          "2025-11-04": [{ slot: "C", playerId: "c-1" }],
        }}
        days={days}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        rosterEntries={[
          { slot: "PG", playerId: null },
          { slot: "C", playerId: "c-1" },
          { slot: "UTIL", playerId: null },
          { slot: "UTIL", playerId: null },
          { slot: "UTIL", playerId: null },
          { slot: "BE", playerId: null },
          { slot: "BE", playerId: null },
          { slot: "BE", playerId: null },
        ]}
        rosterPlayers={[center]}
        schedule={schedule}
      />,
    )

    const headers = screen.getAllByRole("rowheader").map((el) => el.textContent)
    expect(headers.indexOf("PG")).toBeLessThan(headers.indexOf("C"))
    expect(headers.indexOf("C")).toBeLessThan(headers.indexOf("BE"))
    expect(screen.getAllByRole("rowheader", { name: "UTIL" })).toHaveLength(3)
    expect(screen.getAllByRole("rowheader", { name: "BE" })).toHaveLength(3)
    expect(screen.getByRole("columnheader", { name: "Slot" })).toHaveClass(
      "w-12",
      "min-w-12",
    )
    expect(
      screen.getAllByRole("button", { name: /Highlight /i })[0]?.closest("th"),
    ).toHaveClass("w-24", "min-w-24", "max-w-24")

    fireEvent.click(
      screen.getAllByRole("button", { name: /Highlight /i })[0]!,
    )
    fireEvent.click(
      screen.getAllByRole("button", { name: /Highlight /i })[1]!,
    )

    const headersAfter = screen
      .getAllByRole("rowheader")
      .map((el) => el.textContent)
    expect(headersAfter.indexOf("PG")).toBeLessThan(headersAfter.indexOf("C"))
    expect(headersAfter.indexOf("C")).toBeLessThan(headersAfter.indexOf("BE"))

    const pgRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "PG"
    })
    expect(pgRow?.textContent).toContain("—")
    expect(pgRow?.textContent).not.toContain("The Center")

    const cRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "C"
    })
    expect(cRow?.textContent).toContain("The Center")
    const centerButtons = screen.getAllByRole("button", {
      name: /The Center/i,
    })
    expect(
      centerButtons.every((button) =>
        /The Center/.test(button.getAttribute("aria-label") ?? ""),
      ),
    ).toBe(true)
  })

  it("keeps a sitting PG on the PG row", () => {
    render(
      <DailyLineupPanel
        daily={{
          "2025-11-03": [{ slot: "C", playerId: "c-1" }],
          "2025-11-04": [{ slot: "C", playerId: "c-1" }],
        }}
        days={days}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        rosterEntries={[
          { slot: "PG", playerId: "pg-1" },
          { slot: "C", playerId: "c-1" },
          { slot: "BE", playerId: "be-1" },
          { slot: "BE", playerId: "be-2" },
          { slot: "BE", playerId: "be-3" },
        ]}
        rosterPlayers={[pg, bench, center]}
        schedule={schedule}
      />,
    )

    expect(screen.getAllByRole("rowheader", { name: "BE" })).toHaveLength(3)
    const pgRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "PG"
    })
    expect(pgRow?.textContent).toContain("Point Guard")
  })

  it("seats a preview streamer with a game into an empty eligible slot", () => {
    render(
      <DailyLineupPanel
        daily={{
          "2025-11-03": [{ slot: "PG", playerId: "you-1" }],
          "2025-11-04": [{ slot: "PG", playerId: "you-1" }],
        }}
        days={days}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        previewActive
        previewPlayerIds={["fa-a"]}
        previewSpotCount={1}
        rosterEntries={[
          { slot: "PG", playerId: "you-1" },
          { slot: "SG", playerId: null },
        ]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    const sgRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "SG"
    })
    expect(sgRow?.textContent).toContain("Streamer A")
    expect(sgRow?.textContent).toMatch(/preview/i)
    expect(screen.queryByRole("rowheader", { name: "PV" })).not.toBeInTheDocument()
  })

  it("puts preview streamers on PV rows not PG", () => {
    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        extraPlayers={[streamer]}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        previewActive
        previewPlayerIds={["fa-a"]}
        previewSpotCount={1}
        rosterEntries={[{ slot: "PG", playerId: "you-1" }]}
        rosterPlayers={[rostered]}
        schedule={schedule}
      />,
    )

    const pgRow = screen.getAllByRole("row").find((row) => {
      const header = row.querySelector("th")
      return header?.textContent === "PG"
    })
    expect(pgRow?.textContent).toContain("Roster Cut")
    expect(pgRow?.textContent).not.toContain("Streamer A")
    expect(screen.getByRole("rowheader", { name: "PV" })).toBeInTheDocument()
    expect(screen.getByText("Streamer A")).toBeInTheDocument()
  })

  it("shows weekly PG before Bench without packing sitters to the top", () => {
    render(
      <DailyLineupPanel
        daily={daily}
        days={days}
        onReset={vi.fn()}
        onTogglePlayerDay={vi.fn()}
        rosterEntries={[
          { slot: "PG", playerId: "pg-1" },
          { slot: "BE", playerId: "be-1" },
        ]}
        rosterPlayers={[bench, pg]}
        schedule={schedule}
      />,
    )

    const rows = screen.getAllByRole("row")
    const bodyText = rows.map((row) => row.textContent).join("\n")
    expect(bodyText.indexOf("Point Guard")).toBeLessThan(
      bodyText.indexOf("Bench Wing"),
    )
    expect(screen.getByRole("rowheader", { name: "PG" })).toBeInTheDocument()
    expect(screen.getAllByRole("rowheader", { name: "BE" }).length).toBe(1)
  })
})
