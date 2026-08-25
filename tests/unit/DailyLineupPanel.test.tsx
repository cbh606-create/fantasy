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
