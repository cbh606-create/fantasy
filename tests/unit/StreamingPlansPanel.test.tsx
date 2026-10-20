// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import type { MatchupBoard, StreamingPlan } from "@/lib/matchup/types"
import { formatMatchupDayLabel } from "@/lib/matchup/weekCalendarLayout"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"

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

const streamerA: SeasonPlayer = {
  id: "fa-a",
  name: "Streamer A",
  teamAbbr: "BOS",
  positions: ["SG"],
  projectedGames: 82,
  projections: { ...projections, STL: 180 },
  shooting,
}

const streamerB: SeasonPlayer = {
  id: "fa-b",
  name: "Streamer B",
  teamAbbr: "NYK",
  positions: ["PG"],
  projectedGames: 82,
  projections: { ...projections, STL: 160 },
  shooting,
}

const rostered: SeasonPlayer = {
  id: "you-1",
  name: "Roster Cut",
  teamAbbr: "CHI",
  positions: ["PF"],
  projectedGames: 82,
  projections,
  shooting,
}

const board: MatchupBoard = {
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: categoryId === "STL" ? 1 : 10,
    opp: categoryId === "STL" ? 5 : 8,
    outcome: categoryId === "STL" ? "L" : "W",
    winProb: categoryId === "STL" ? 0.2 : 0.8,
  })),
  wins: 8,
  losses: 1,
  ties: 0,
  projectedCatWins: 7,
}

const schedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-05",
    days: ["2025-11-03", "2025-11-04", "2025-11-05"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "ORL" },
    { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "MIA" },
  ],
}

const state: SeasonLeagueState = {
  name: "Test",
  season: 2025,
  categories: ALL_CATEGORY_IDS.map((id) => ({ id, enabled: true, weight: 1 })),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "UTIL", playerId: "you-1" },
        { slot: "BE", playerId: null },
      ],
    },
    {
      teamIndex: 1,
      name: "Them",
      entries: [{ slot: "UTIL", playerId: null }],
    },
  ],
  players: [streamerA, streamerB, rostered],
  availablePlayerIds: ["fa-a", "fa-b"],
  waiverOrder: [0, 1],
  source: "manual",
}

const star: SeasonPlayer = {
  id: "star",
  name: "Star",
  teamAbbr: "CHI",
  positions: ["PF"],
  projectedGames: 82,
  projections,
  shooting,
}

const scrub: SeasonPlayer = {
  id: "scrub",
  name: "Scrub",
  teamAbbr: "ATL",
  positions: ["C"],
  projectedGames: 82,
  projections,
  shooting,
}

const protectedState: SeasonLeagueState = {
  ...state,
  players: [streamerA, star, scrub],
  availablePlayerIds: ["fa-a"],
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "UTIL", playerId: "star" },
        { slot: "BE", playerId: "scrub" },
      ],
    },
    state.teams[1]!,
  ],
}

const protectedSchedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-03",
    days: ["2025-11-03"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
  ],
}

const noGameCut: SeasonPlayer = {
  id: "you-idle",
  name: "No Game Cut",
  teamAbbr: "CHI",
  positions: ["PF"],
  projectedGames: 82,
  projections,
  shooting,
}

const playsCut: SeasonPlayer = {
  id: "you-play",
  name: "Plays Cut",
  teamAbbr: "ATL",
  positions: ["C"],
  projectedGames: 82,
  projections,
  shooting,
}

const dropState: SeasonLeagueState = {
  ...state,
  players: [streamerA, streamerB, noGameCut, playsCut],
  teams: [
    {
      teamIndex: 0,
      name: "You",
      entries: [
        { slot: "UTIL", playerId: "you-idle" },
        { slot: "BE", playerId: "you-play" },
      ],
    },
    state.teams[1]!,
  ],
}

const dropSchedule: ScheduleResponse = {
  source: "fixture",
  matchup: {
    scoringPeriodId: 1,
    startDate: "2025-11-03",
    endDate: "2025-11-03",
    days: ["2025-11-03"],
  },
  games: [
    { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
    { date: "2025-11-03", homeAbbr: "ATL", awayAbbr: "ORL" },
  ],
}

describe("StreamingPlansPanel", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders 1-spot 2-spot and 3-spot plan headings with add budget control", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    expect(
      screen.getByRole("heading", { name: /streaming plans/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^1-spot$/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^2-spot$/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^3-spot$/i })).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: /weekly add budget/i })).toHaveValue(3)
    expect(screen.getAllByText(/Adds \d+\/3/).length).toBeGreaterThan(0)
  })

  it("rebuilds plans when weekly add budget changes", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    const budget = screen.getByRole("spinbutton", { name: /weekly add budget/i })
    fireEvent.click(screen.getByRole("button", { name: /decrease weekly add budget/i }))
    expect(budget).toHaveValue(2)
    expect(screen.getAllByText(/Adds \d+\/2/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /increase weekly add budget/i }))
    fireEvent.click(screen.getByRole("button", { name: /increase weekly add budget/i }))
    expect(budget).toHaveValue(4)
    expect(screen.getAllByText(/Adds \d+\/4/).length).toBeGreaterThan(0)
  })

  it("renders Add and Drop rows for built plans", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const monday = screen.getAllByText(formatMatchupDayLabel("2025-11-03"))[0]
    expect(monday?.closest("th")).toHaveClass("w-[6.75rem]", "min-w-[6.75rem]")
    expect(screen.getAllByRole("columnheader", { name: /^Move$/i })[0]).toHaveClass(
      "w-28",
      "min-w-28",
      "max-w-28",
    )
    expect(screen.getAllByRole("rowheader", { name: /^Add$/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("rowheader", { name: /^Drop$/i }).length).toBeGreaterThan(0)
    const addSelect = screen.getAllByRole("combobox", { name: /Stream add/i })[0]!
    expect(addSelect).toHaveTextContent(/Streamer A/i)
  })

  it("shows also-consider alternatives in team then player panels", async () => {
    const bothPlaySchedule: ScheduleResponse = {
      ...schedule,
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ORL" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "CHI" },
      ],
    }

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={bothPlaySchedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const addSelect = screen.getAllByRole("combobox", { name: /Stream add/i })[0]!
    expect(screen.queryByRole("listbox")).toBeNull()
    fireEvent.click(addSelect)
    await waitFor(() => {
      expect(screen.getByLabelText("Team BOS")).toBeInTheDocument()
      expect(screen.getByLabelText("Team NYK")).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByLabelText("Team BOS"))
    expect(
      screen.getByRole("option", { name: /Add Streamer A/i }),
    ).toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByLabelText("Team NYK"))
    expect(
      screen.getByRole("option", { name: /Add Streamer B/i }),
    ).toBeInTheDocument()
  })

  it("shows add ordinal next to streamer adds", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )

    expect(screen.getAllByLabelText(/^Add \d+$/).length).toBeGreaterThan(0)
  })

  it("marks streamer game days on add selects and day headers", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const gameDaySelect = screen.getAllByRole("combobox", {
      name: /Stream add/i,
    }).find((el) => el.getAttribute("title") === "Game day")
    expect(gameDaySelect).toBeTruthy()
    expect(screen.getAllByLabelText("Game day").length).toBeGreaterThan(0)

    const gameDayHeaders = screen.getAllByTitle("Streamer game day")
    expect(gameDayHeaders.length).toBeGreaterThan(0)
    expect(gameDayHeaders[0]?.className).toMatch(/font-bold/)
  })

  it("keeps the streamer name on empty mid-week cells with Game/Off labels", () => {
    const offNightSchedule: ScheduleResponse = {
      ...schedule,
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-04", homeAbbr: "MIA", awayAbbr: "ATL" },
        { date: "2025-11-05", homeAbbr: "BOS", awayAbbr: "ORL" },
      ],
    }
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={offNightSchedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const tueAdd = screen.getAllByRole("combobox", {
      name: /Stream add/i,
    }).find((el) =>
      (el.getAttribute("aria-label") ?? "").includes(
        formatMatchupDayLabel("2025-11-04"),
      ),
    )
    expect(tueAdd).toBeTruthy()
    expect(tueAdd).toHaveTextContent(/Streamer A/i)
    const tueCell = tueAdd!.closest("td")
    expect(tueCell).toBeTruthy()
    expect(
      within(tueCell!).getByLabelText("Off night"),
    ).toBeInTheDocument()
    expect(
      within(tueCell!).getByText(/Streamer A/i).closest("[data-game-night]"),
    ).toHaveAttribute("data-game-night", "off")

    const monAdd = screen.getAllByRole("combobox", {
      name: /Stream add/i,
    }).find((el) =>
      (el.getAttribute("aria-label") ?? "").includes(
        formatMatchupDayLabel("2025-11-03"),
      ),
    )
    expect(monAdd).toBeTruthy()
    expect(
      monAdd!.closest("[data-game-night]"),
    ).toHaveAttribute("data-game-night", "game")
  })

  it("tints multi-spot and 1-spot rows", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    const spot1Add = screen.getAllByRole("rowheader", { name: /Spot 1 Add/i })[0]
    const addRow = screen.getAllByRole("rowheader", { name: /^Add$/i })[0]
    expect(spot1Add?.closest("tr")?.className).toMatch(
      /border-l-\[var\(--color-success\)\]/,
    )
    expect(addRow?.closest("tr")?.className).toMatch(
      /border-l-\[var\(--color-success\)\]/,
    )
  })

  it("does not render strategy toggles", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    expect(screen.queryByText("Strategy")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Aggressive" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Balanced" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Conservative" })).not.toBeInTheDocument()
    expect(screen.queryByText("Preview")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^None$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^1-spot$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^2-spot$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^3-spot$/i })).not.toBeInTheDocument()
  })

  it("shows summary reasons under a plan header", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    expect(
      screen.getAllByText(/Prioritized 3-in-4|blocks/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Fills empty stream spots for the week/).length,
    ).toBeGreaterThan(0)
  })

  it("includes ADP-protected players in the opened dropbox", async () => {
    render(
      <StreamingPlansPanel
        adpByPlayerId={{ star: 25, scrub: 200 }}
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={protectedSchedule}
        state={protectedState}
        today="2025-11-03"
      />,
    )
    const select = screen.getAllByRole("combobox", { name: /Roster drop/i })[0]!
    fireEvent.mouseDown(select)
    fireEvent.focus(select)
    await waitFor(() => {
      expect(select.querySelectorAll("option").length).toBeGreaterThan(1)
    })
    const values = Array.from(select.querySelectorAll("option")).map(
      (option) => (option as HTMLOptionElement).value,
    )
    expect(values).toContain("scrub")
    expect(values).toContain("star")
  })

  it("starts ADP stars off the droppable toggles and lets the user flip them", () => {
    render(
      <StreamingPlansPanel
        adpByPlayerId={{ star: 25, scrub: 200 }}
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={protectedSchedule}
        state={protectedState}
        today="2025-11-03"
      />,
    )
    const starToggle = screen.getByRole("button", { name: "Droppable Star" })
    const scrubToggle = screen.getByRole("button", { name: "Droppable Scrub" })
    expect(starToggle).toHaveAttribute("aria-pressed", "false")
    expect(scrubToggle).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(starToggle)
    expect(starToggle).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(scrubToggle)
    expect(scrubToggle).toHaveAttribute("aria-pressed", "false")
  })

  it("shows Hold dropbox on every remaining day including tomorrow", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )
    const dropSelects = screen.getAllByRole("combobox", {
      name: /Roster drop.*spot 1/i,
    })
    // 1-spot plan × 3 remaining days (plus 2-spot and 3-spot rows)
    expect(dropSelects.length).toBeGreaterThanOrEqual(3)

    const labels = dropSelects.map((el) => el.getAttribute("aria-label") ?? "")
    expect(
      labels.some((label) =>
        label.includes(formatMatchupDayLabel("2025-11-04")),
      ),
    ).toBe(true)
    expect(
      labels.some((label) =>
        label.includes(formatMatchupDayLabel("2025-11-05")),
      ),
    ).toBe(true)

    fireEvent.mouseDown(dropSelects[0]!)
    fireEvent.focus(dropSelects[0]!)
    fireEvent.change(dropSelects[0]!, { target: { value: "you-1" } })
    expect(screen.getAllByText("STL").length).toBeGreaterThan(0)
  })

  it("applies a parent preview spot without a panel toggle", () => {
    const onPreviewPlanChange = vi.fn()

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        previewSpotCount={1}
        schedule={schedule}
        state={state}
      />,
    )

    expect(onPreviewPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({ spotCount: 1 }),
    )
    expect(screen.getByRole("status")).toHaveTextContent("Previewing 1-spot")
  })

  it("renders roster drop selects on add cells and rebuilds on change", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
        today="2025-11-03"
      />,
    )

    const selects = screen.getAllByRole("combobox", { name: /roster drop/i })
    expect(selects.length).toBeGreaterThan(0)

    const firstSelect = selects[0]!
    expect(firstSelect).toHaveClass("w-full")
    expect(firstSelect).not.toHaveClass("min-w-0")
    expect(firstSelect).toHaveValue("you-idle")
    fireEvent.mouseDown(firstSelect)
    fireEvent.focus(firstSelect)
    fireEvent.change(firstSelect, { target: { value: "you-idle" } })
    expect(firstSelect).toHaveValue("you-idle")
    fireEvent.change(firstSelect, { target: { value: "you-play" } })
    expect(firstSelect).toHaveValue("you-play")
  })

  it("lists To IR for a no-game active player and stores ir:<id>", async () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
        today="2025-11-03"
      />,
    )

    const oneSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    fireEvent.mouseDown(oneSpotSelect)
    fireEvent.focus(oneSpotSelect)

    await waitFor(() => {
      const irOption = [...oneSpotSelect.querySelectorAll("option")].find(
        (option) => option.textContent === "To IR · No Game Cut (after OUT)",
      )
      expect(irOption).toBeTruthy()
      expect(irOption).toHaveProperty("value", "ir:you-idle")
    })

    fireEvent.change(oneSpotSelect, { target: { value: "ir:you-idle" } })
    expect(oneSpotSelect).toHaveValue("ir:you-idle")
  })

  it("shows drop selects on every matchup day when today is before the week", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-10-01"
      />,
    )

    const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
      "tr",
    )!
    const daySelects = dropRow.querySelectorAll("td select")
    expect(daySelects.length).toBe(schedule.matchup.days.length)
    expect(daySelects[0]).toHaveValue("open_slot")
  })

  it("hides the dropbox when the matchup week is already over", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-10"
      />,
    )

    expect(
      screen.queryByRole("combobox", { name: /Roster drop/i }),
    ).not.toBeInTheDocument()
  })

  it("previews that plan when a roster drop override changes", () => {
    const onPreviewPlanChange = vi.fn()

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
        today="2025-11-03"
      />,
    )

    expect(onPreviewPlanChange).not.toHaveBeenCalled()

    const oneSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    fireEvent.mouseDown(oneSpotSelect)
    fireEvent.focus(oneSpotSelect)
    fireEvent.change(oneSpotSelect, { target: { value: "you-idle" } })

    const previewed = onPreviewPlanChange.mock.calls.at(-1)?.[0] as StreamingPlan
    expect(previewed?.spotCount).toBe(1)
    expect(previewed?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-idle")
  })

  it("resets add and drop overrides back to the suggested plan", async () => {
    const onPreviewPlanChange = vi.fn()

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
        today="2025-11-03"
      />,
    )

    const suggested = screen.getByRole("button", {
      name: /reset to suggested|suggested plan/i,
    })
    expect(suggested).toHaveAttribute("aria-pressed", "true")
    expect(suggested).toBeDisabled()

    const oneSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    fireEvent.mouseDown(oneSpotSelect)
    fireEvent.focus(oneSpotSelect)
    await waitFor(() => {
      expect(oneSpotSelect.querySelectorAll("option").length).toBeGreaterThan(1)
    })
    const suggestedDrop = (oneSpotSelect as HTMLSelectElement).value
    const overrideDrop =
      suggestedDrop === "you-idle" ? "you-play" : "you-idle"
    fireEvent.change(oneSpotSelect, { target: { value: overrideDrop } })

    await waitFor(() => {
      expect(suggested).toHaveAttribute("aria-pressed", "false")
    })
    expect(suggested).toBeEnabled()
    const overridden = onPreviewPlanChange.mock.calls.at(-1)?.[0] as StreamingPlan
    expect(overridden?.days[0]?.cells[0]?.rosterDropPlayerId).toBe(overrideDrop)

    fireEvent.click(suggested)

    await waitFor(() => {
      expect(suggested).toHaveAttribute("aria-pressed", "true")
    })
    expect(suggested).toBeDisabled()
    const dropAfter = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    expect(dropAfter).toHaveValue(suggestedDrop)
  })

  it("rebuilds preview plan when roster drop override changes", () => {
    const onPreviewPlanChange = vi.fn()

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
        today="2025-11-03"
      />,
    )

    const oneSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    fireEvent.mouseDown(oneSpotSelect)
    fireEvent.focus(oneSpotSelect)
    fireEvent.change(oneSpotSelect, { target: { value: "you-idle" } })

    const initialPlan = onPreviewPlanChange.mock.calls.at(-1)?.[0]
    expect(initialPlan?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-idle")

    expect(oneSpotSelect).toHaveValue("you-idle")
    fireEvent.change(oneSpotSelect, { target: { value: "you-play" } })

    const rebuiltPlan = onPreviewPlanChange.mock.calls.at(-1)?.[0]
    expect(rebuiltPlan?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-play")
  })

  it("keeps roster drop overrides isolated per spot-count plan", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
        today="2025-11-03"
      />,
    )

    const oneSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    expect(oneSpotSelect).toHaveValue("you-idle")
    fireEvent.mouseDown(oneSpotSelect)
    fireEvent.focus(oneSpotSelect)
    fireEvent.change(oneSpotSelect, { target: { value: "you-play" } })
    expect(oneSpotSelect).toHaveValue("you-play")

    const twoSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[1]!
    expect(twoSpotSelect).toHaveValue("you-idle")
  })

  it("shows a mute hint when winner recipes hit trailing cats", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        winnerStreamRecipes={[
          {
            situationCat: "STL",
            addKind: "STL",
            addGroup: "G",
            count: 4,
          },
        ]}
      />,
    )

    expect(
      screen.getByText("Winners here streamed STL when trailing those cats"),
    ).toBeInTheDocument()
  })

  it("hides the winner-stream hint when prior was skipped", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    expect(screen.queryByText(/Winners here streamed/i)).not.toBeInTheDocument()
  })

  it("does not show a suggested-drop tooltip beside drop selects", () => {
    const daily: DailyLineups = {
      "2025-11-03": [{ slot: "UTIL", playerId: "you-1" }],
      "2025-11-04": [{ slot: "UTIL", playerId: "you-1" }],
      "2025-11-05": [{ slot: "UTIL", playerId: "you-1" }],
    }
    const hoverSchedule: ScheduleResponse = {
      ...schedule,
      games: [
        ...schedule.games,
        { date: "2025-11-04", homeAbbr: "CHI", awayAbbr: "WAS" },
      ],
    }

    render(
      <StreamingPlansPanel
        board={board}
        daily={daily}
        leagueId="lg1"
        playersById={{}}
        schedule={hoverSchedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
      "tr",
    )!
    const futureCell = dropRow.querySelectorAll("td")[1]!
    expect(futureCell.querySelector("select")).not.toBeNull()
    fireEvent.mouseEnter(futureCell.querySelector("select")!)

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("past Drop cells have no combobox and a muted recorded label", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-04"
      />,
    )

    expect(
      screen.queryByRole("combobox", {
        name: new RegExp(formatMatchupDayLabel("2025-11-03"), "i"),
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("combobox", { name: /Roster drop/i }).length,
    ).toBeGreaterThan(0)

    const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
      "tr",
    )!
    const pastCell = dropRow.querySelectorAll("td")[0]!
    expect(pastCell.querySelector("select")).toBeNull()
    expect(pastCell).toHaveTextContent("Open slot")
    expect(pastCell.querySelector("span")).toHaveClass("text-[var(--color-mute)]")
  })

  it("shows Opp: name on add cells when the plan has opponentDays", () => {
    const oppStreamer: SeasonPlayer = {
      id: "fa-opp",
      name: "Opp Streamer",
      teamAbbr: "WAS",
      positions: ["SG"],
      projectedGames: 82,
      projections: { ...projections, STL: 90 },
      shooting,
    }
    const oppState: SeasonLeagueState = {
      ...state,
      players: [...state.players, oppStreamer],
      availablePlayerIds: [...state.availablePlayerIds, "fa-opp"],
    }

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        oppSpotCount={1}
        playersById={{}}
        schedule={schedule}
        state={oppState}
        today="2025-11-03"
      />,
    )
    expect(screen.getAllByText(/Opp:/).length).toBeGreaterThan(0)
  })

  it("still exposes drop selects on every day of a future week", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        oppSpotCount={1}
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-10-01"
      />,
    )
    const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
      "tr",
    )!
    expect(dropRow.querySelectorAll("td")[0]!.querySelector("select")).not.toBeNull()
    expect(dropRow.querySelectorAll("td")[1]!.querySelector("select")).not.toBeNull()
  })

  it("passes built plans with opponentDays to onPlansBuilt", () => {
    const onPlansBuilt = vi.fn()
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPlansBuilt={onPlansBuilt}
        oppSpotCount={1}
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )
    expect(onPlansBuilt).toHaveBeenCalled()
    const payload = onPlansBuilt.mock.calls.at(-1)?.[0] as {
      plans: StreamingPlan[]
      noneOpponentPlan: StreamingPlan | null
    }
    expect(payload.plans).toHaveLength(3)
    expect(payload.plans[0]!.opponentDays).toHaveLength(
      schedule.matchup.days.length,
    )
    expect(payload.noneOpponentPlan?.addsUsed).toBe(0)
  })

  it("keeps today's dropbox on the chosen player when a streamer is already seated", async () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-04"
      />,
    )

    const todaySelect = screen.getAllByRole("combobox", {
      name: /Roster drop.*spot 1/i,
    })[0]!
    // drop_add days surface the swapped-out streamer, not a blank Hold.
    expect(todaySelect).not.toHaveDisplayValue("Hold")
    fireEvent.mouseDown(todaySelect)
    fireEvent.focus(todaySelect)
    await waitFor(() => {
      expect(todaySelect.querySelectorAll("option").length).toBeGreaterThan(1)
    })
    fireEvent.change(todaySelect, { target: { value: "you-1" } })
    expect(todaySelect).toHaveValue("you-1")
  })

  it("shows the dropped streamer on drop_add days instead of Hold", () => {
    const onPlansBuilt = vi.fn()
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPlansBuilt={onPlansBuilt}
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const payload = onPlansBuilt.mock.calls.at(-1)?.[0] as {
      plans: StreamingPlan[]
    }
    const plan = payload.plans.find((item) => item.spotCount === 1)!
    const dropAdd = plan.days
      .flatMap((day) =>
        day.cells
          .filter((cell) => cell.action === "drop_add" && cell.droppedPlayerId)
          .map((cell) => ({ date: day.date, cell })),
      )
      .at(0)
    expect(dropAdd).toBeTruthy()

    const dayLabel = formatMatchupDayLabel(dropAdd!.date)
    const dropSelect = screen.getAllByRole("combobox", {
      name: /Roster drop.*spot 1/i,
    }).find((el) => (el.getAttribute("aria-label") ?? "").includes(dayLabel))
    expect(dropSelect).toHaveValue(dropAdd!.cell.droppedPlayerId)
    expect(dropSelect).not.toHaveDisplayValue("Hold")
  })

  it("seeds punts under 0.38 only for most categories", () => {
    const { rerender } = render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        opponentTeamIndex={1}
        playersById={{}}
        schedule={schedule}
        statWindow="season"
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Punt PTS" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )

    fireEvent.click(screen.getByRole("button", { name: "Punt STL" }))
    fireEvent.click(screen.getByRole("button", { name: "Punt PTS" }))

    rerender(
      <StreamingPlansPanel
        board={{
          ...board,
          categories: board.categories.map((category) =>
            category.categoryId === "STL"
              ? { ...category, you: 2 }
              : category,
          ),
        }}
        leagueId="lg1"
        opponentTeamIndex={1}
        playersById={{}}
        schedule={schedule}
        statWindow="season"
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    expect(screen.getByRole("button", { name: "Punt PTS" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    rerender(
      <StreamingPlansPanel
        board={{
          ...board,
          categories: board.categories.map((category) => {
            if (category.categoryId === "REB") {
              return { ...category, winProb: 0.27 }
            }
            if (category.categoryId === "STL") {
              return { ...category, winProb: 0.5 }
            }
            return category
          }),
        }}
        leagueId="lg1"
        opponentTeamIndex={2}
        playersById={{}}
        schedule={schedule}
        statWindow="season"
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt REB" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    expect(screen.getByRole("button", { name: "Punt PTS" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )

    rerender(
      <StreamingPlansPanel
        board={{
          ...board,
          categories: board.categories.map((category) =>
            category.categoryId === "BLK"
              ? { ...category, winProb: 0.1 }
              : { ...category, winProb: 0.6 },
          ),
        }}
        leagueId="lg1"
        opponentTeamIndex={2}
        playersById={{}}
        schedule={schedule}
        statWindow="l7"
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt BLK" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Punt REB" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("does not seed punts for each category", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={{ ...state, scoringMode: "each_category" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("seeds again after the panel remounts", () => {
    const { unmount } = render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Punt STL" }))
    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )

    unmount()
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("waits to seed punts until puntSeedReady is true", () => {
    const { rerender } = render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        puntSeedReady={false}
        schedule={schedule}
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )

    rerender(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        puntSeedReady={true}
        schedule={schedule}
        state={{ ...state, scoringMode: "most_categories" }}
      />,
    )

    expect(screen.getByRole("button", { name: "Punt STL" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("renders add selects on every remaining day and spot", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const addSelects = screen.getAllByRole("combobox", {
      name: /Stream add/i,
    })
    // 1+2+3 spots × 3 remaining days
    expect(addSelects.length).toBe(18)
    const labels = addSelects.map((el) => el.getAttribute("aria-label") ?? "")
    expect(
      labels.some((label) =>
        label.includes(formatMatchupDayLabel("2025-11-05")),
      ),
    ).toBe(true)
  })

  it("builds lazy add options only after the select opens", async () => {
    const retired: SeasonPlayer = {
      id: "fa-retired",
      name: "Retired FA",
      teamAbbr: "BOS",
      positions: ["SF"],
      projectedGames: undefined,
      projections,
      shooting,
    }
    const outPlayer: SeasonPlayer = {
      id: "fa-out",
      name: "Out FA",
      teamAbbr: "BOS",
      positions: ["PF"],
      projectedGames: 82,
      injuryStatus: "out",
      projections,
      shooting,
    }
    const noGameTeam: SeasonPlayer = {
      id: "fa-off",
      name: "Off Night FA",
      teamAbbr: "DAL",
      positions: ["PG"],
      projectedGames: 82,
      projections,
      shooting,
    }
    const alsoEligible: SeasonPlayer = {
      id: "fa-also",
      name: "Also Eligible",
      teamAbbr: "BOS",
      positions: ["SF"],
      projectedGames: 82,
      projections: { ...projections, STL: 100 },
      shooting,
    }
    const richState: SeasonLeagueState = {
      ...state,
      players: [
        ...state.players,
        retired,
        outPlayer,
        noGameTeam,
        alsoEligible,
      ],
      availablePlayerIds: [
        ...state.availablePlayerIds,
        "fa-retired",
        "fa-out",
        "fa-off",
        "fa-also",
      ],
    }

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={richState}
        today="2025-11-03"
      />,
    )

    const addSelect = screen.getAllByRole("combobox", {
      name: /Stream add/i,
    }).find((el) =>
      (el.getAttribute("aria-label") ?? "").includes(
        formatMatchupDayLabel("2025-11-03"),
      ),
    )!
    expect(screen.queryByRole("listbox")).toBeNull()

    fireEvent.click(addSelect)

    await waitFor(() => {
      expect(screen.getByLabelText("Team BOS")).toBeInTheDocument()
    })
    expect(screen.queryByLabelText("Team DAL")).toBeNull()

    fireEvent.mouseEnter(screen.getByLabelText("Team BOS"))
    expect(
      screen.getByRole("option", { name: /Add Streamer A/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: /Add Also Eligible/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: /Add Retired FA/i }),
    ).toBeNull()
    expect(screen.queryByRole("option", { name: /Add Out FA/i })).toBeNull()
    expect(
      screen.queryByRole("option", { name: /Add Off Night FA/i }),
    ).toBeNull()
  })

  it("rebuilds only the changed spotCount plan when a drop changes", () => {
    const onPlansBuilt = vi.fn()
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPlansBuilt={onPlansBuilt}
        playersById={{}}
        schedule={schedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const before = onPlansBuilt.mock.calls.at(-1)?.[0] as {
      baselinePlans: StreamingPlan[]
    }
    const plan2Before = before.baselinePlans.find((plan) => plan.spotCount === 2)
    const plan3Before = before.baselinePlans.find((plan) => plan.spotCount === 3)
    const plan1Before = before.baselinePlans.find((plan) => plan.spotCount === 1)

    const dropSelect = screen.getAllByRole("combobox", {
      name: /Roster drop.*spot 1/i,
    })[0]!
    fireEvent.mouseDown(dropSelect)
    fireEvent.focus(dropSelect)
    fireEvent.change(dropSelect, { target: { value: "you-1" } })

    const after = onPlansBuilt.mock.calls.at(-1)?.[0] as {
      baselinePlans: StreamingPlan[]
    }
    expect(after.baselinePlans.find((plan) => plan.spotCount === 2)).toBe(
      plan2Before,
    )
    expect(after.baselinePlans.find((plan) => plan.spotCount === 3)).toBe(
      plan3Before,
    )
    expect(after.baselinePlans.find((plan) => plan.spotCount === 1)).not.toBe(
      plan1Before,
    )
  })

  it("replaces the shown streamer on a day whose drop still reads Hold", async () => {
    const bothPlaySchedule: ScheduleResponse = {
      ...schedule,
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ORL" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "CHI" },
      ],
    }
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={bothPlaySchedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const oneSpotRoot = screen
      .getByRole("heading", { name: /^1-spot$/i })
      .closest("div")!
    const friLabel = formatMatchupDayLabel("2025-11-05")
    const friAdd = within(oneSpotRoot)
      .getAllByRole("combobox", { name: /Stream add/i })
      .find((el) => (el.getAttribute("aria-label") ?? "").includes(friLabel))!
    expect(friAdd).not.toHaveTextContent("Streamer B")
    const friDrop = within(oneSpotRoot)
      .getAllByRole("combobox", { name: /Roster drop/i })
      .find((el) => (el.getAttribute("aria-label") ?? "").includes(friLabel))!
    expect(friDrop).toHaveValue("hold")

    fireEvent.click(friAdd)
    await waitFor(() => {
      expect(screen.getByLabelText("Team NYK")).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByLabelText("Team NYK"))
    fireEvent.click(screen.getByRole("option", { name: "Add Streamer B" }))

    await waitFor(() => {
      expect(
        within(oneSpotRoot)
          .getAllByRole("combobox", { name: /Stream add/i })
          .find((el) =>
            (el.getAttribute("aria-label") ?? "").includes(friLabel),
          ),
      ).toHaveTextContent("Streamer B")
    })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("blocks adding a streamer while the drop select is Hold", async () => {
    const onPlansBuilt = vi.fn()
    const bothPlaySchedule: ScheduleResponse = {
      ...schedule,
      games: [
        { date: "2025-11-03", homeAbbr: "BOS", awayAbbr: "WAS" },
        { date: "2025-11-03", homeAbbr: "NYK", awayAbbr: "ORL" },
        { date: "2025-11-04", homeAbbr: "BOS", awayAbbr: "MIA" },
        { date: "2025-11-05", homeAbbr: "NYK", awayAbbr: "CHI" },
      ],
    }
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPlansBuilt={onPlansBuilt}
        playersById={{}}
        schedule={bothPlaySchedule}
        state={state}
        today="2025-11-03"
      />,
    )

    const oneSpotRoot = screen
      .getByRole("heading", { name: /^1-spot$/i })
      .closest("div")!
    const dropSelect = within(oneSpotRoot).getAllByRole("combobox", {
      name: /Roster drop/i,
    })[0]!
    fireEvent.mouseDown(dropSelect)
    fireEvent.focus(dropSelect)
    await waitFor(() => {
      expect(
        Array.from(dropSelect.querySelectorAll("option")).some(
          (option) => (option as HTMLOptionElement).value === "hold",
        ),
      ).toBe(true)
    })
    fireEvent.change(dropSelect, { target: { value: "hold" } })
    expect(dropSelect).toHaveValue("hold")

    await waitFor(() => {
      expect(onPlansBuilt.mock.calls.length).toBeGreaterThan(0)
    })
    const beforePayload = onPlansBuilt.mock.calls.at(-1)?.[0] as {
      plans: StreamingPlan[]
    }
    const beforePlan = beforePayload.plans.find((plan) => plan.spotCount === 1)!
    const beforeAdds = beforePlan.addsUsed
    const beforePlayerId = beforePlan.days[0]!.cells[0]!.playerId

    const addSelect = within(oneSpotRoot).getAllByRole("combobox", {
      name: /Stream add/i,
    })[0]!
    const addLabelBefore = addSelect.textContent ?? ""
    const otherName =
      /Streamer A/i.test(addLabelBefore) ? "Streamer B" : "Streamer A"
    const otherTeam = otherName === "Streamer A" ? "BOS" : "NYK"
    fireEvent.click(addSelect)
    await waitFor(() => {
      expect(screen.getByLabelText(`Team ${otherTeam}`)).toBeInTheDocument()
    })
    fireEvent.mouseEnter(screen.getByLabelText(`Team ${otherTeam}`))
    fireEvent.click(screen.getByRole("option", { name: `Add ${otherName}` }))

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Choose who to drop.*before adding/i,
    )
    const addSelectAfter = within(oneSpotRoot).getAllByRole("combobox", {
      name: /Stream add/i,
    })[0]!
    expect(addSelectAfter).toHaveTextContent(addLabelBefore)
    expect(addSelectAfter).not.toHaveTextContent(otherName)
    const afterPlan = (
      onPlansBuilt.mock.calls.at(-1)?.[0] as { plans: StreamingPlan[] }
    ).plans.find((plan) => plan.spotCount === 1)!
    expect(afterPlan.addsUsed).toBe(beforeAdds)
    expect(afterPlan.days[0]!.cells[0]!.playerId).toBe(beforePlayerId)
  })
})
