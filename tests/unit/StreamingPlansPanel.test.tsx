// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
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
  projections: { ...projections, STL: 180 },
  shooting,
}

const streamerB: SeasonPlayer = {
  id: "fa-b",
  name: "Streamer B",
  teamAbbr: "NYK",
  positions: ["PG"],
  projections: { ...projections, STL: 160 },
  shooting,
}

const rostered: SeasonPlayer = {
  id: "you-1",
  name: "Roster Cut",
  teamAbbr: "CHI",
  positions: ["PF"],
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
    expect(screen.getByRole("spinbutton", { name: /weekly add budget/i })).toHaveValue(7)
    expect(screen.getAllByText(/Adds \d+\/7/).length).toBeGreaterThan(0)
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
    expect(budget).toHaveValue(6)
    expect(screen.getAllByText(/Adds \d+\/6/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /increase weekly add budget/i }))
    fireEvent.click(screen.getByRole("button", { name: /increase weekly add budget/i }))
    expect(budget).toHaveValue(8)
    expect(screen.getAllByText(/Adds \d+\/8/).length).toBeGreaterThan(0)
  })

  it("renders Add and Drop rows for built plans", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    const monday = screen.getAllByText(formatMatchupDayLabel("2025-11-03"))[0]
    expect(monday?.closest("th")).toHaveClass("w-24", "min-w-24", "max-w-24")
    expect(screen.getAllByRole("columnheader", { name: /^Move$/i })[0]).toHaveClass(
      "w-[16rem]",
      "min-w-[16rem]",
      "max-w-[16rem]",
    )
    expect(screen.getAllByRole("rowheader", { name: /^Add$/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("rowheader", { name: /^Drop$/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link", { name: /Streamer A/i })[0]).toHaveAttribute(
      "href",
      "/waivers/lg1?addPlayerId=fa-a",
    )
  })

  it("shows also-consider alternatives in a custom hover tooltip", () => {
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
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))

    const link = screen.getAllByRole("link", { name: /Streamer/i })[0]!
    fireEvent.mouseEnter(link.parentElement!)

    expect(screen.getByRole("tooltip")).toHaveTextContent(/Also consider/i)
  })

  it("shows add ordinal next to streamer adds", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    expect(screen.getAllByLabelText(/^Add \d+$/).length).toBeGreaterThan(0)
  })

  it("bolds streamer names on game days and mutes off nights", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    const gameDayLinks = screen.getAllByRole("link", { name: /Streamer A/i })
    expect(gameDayLinks.length).toBeGreaterThan(0)
    expect(gameDayLinks[0]?.className).toMatch(/font-bold/)
    fireEvent.mouseEnter(gameDayLinks[0]!.parentElement!)
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Game day/i)

    const gameDayHeaders = screen.getAllByTitle("Streamer game day")
    expect(gameDayHeaders.length).toBeGreaterThan(0)
    expect(gameDayHeaders[0]?.className).toMatch(/font-bold/)
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

  it("defaults strategy to board suggestion and rebuilds on toggle", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))
    expect(screen.getByRole("button", { name: "Aggressive" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByText("Suggested: Conservative")).toBeInTheDocument()
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
      screen.getAllByText(/Prioritized 3-in-4|blocks|Skipped thin|Board/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Adds only when the board improves/).length,
    ).toBeGreaterThan(0)
  })

  it("rebuilds with adpByPlayerId so ADP≤60 roster drops stay protected", () => {
    const star: SeasonPlayer = {
      id: "star",
      name: "Star",
      teamAbbr: "CHI",
      positions: ["PF"],
      projections,
      shooting,
    }
    const scrub: SeasonPlayer = {
      id: "scrub",
      name: "Scrub",
      teamAbbr: "ATL",
      positions: ["C"],
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

    render(
      <StreamingPlansPanel
        adpByPlayerId={{ star: 25, scrub: 200 }}
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={protectedSchedule}
        state={protectedState}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))

    expect(screen.getAllByText(/Protected ADP ≤ 60/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Scrub").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("Star")).toHaveLength(0)
  })

  it("renders None/1/2/3 preview selector defaulting to None", () => {
    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    const none = screen.getByRole("button", { name: /^None$/i })
    const one = screen.getByRole("button", { name: /^1-spot$/i })
    const two = screen.getByRole("button", { name: /^2-spot$/i })
    const three = screen.getByRole("button", { name: /^3-spot$/i })

    expect(none).toHaveAttribute("aria-pressed", "true")
    expect(one).toHaveAttribute("aria-pressed", "false")
    expect(two).toHaveAttribute("aria-pressed", "false")
    expect(three).toHaveAttribute("aria-pressed", "false")
  })

  it("calls onPreviewPlanChange with the 1-spot plan when 1-spot is selected", () => {
    const onPreviewPlanChange = vi.fn()

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /^1-spot$/i }))

    expect(onPreviewPlanChange).toHaveBeenCalledTimes(1)
    expect(onPreviewPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({ spotCount: 1 }),
    )
  })

  it("calls onPreviewPlanChange(null) when None is selected after a plan", () => {
    const onPreviewPlanChange = vi.fn()

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={schedule}
        state={state}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /^1-spot$/i }))
    fireEvent.click(screen.getByRole("button", { name: /^None$/i }))

    expect(onPreviewPlanChange).toHaveBeenLastCalledWith(null)
  })

  it("renders roster drop selects on add cells and rebuilds on change", () => {
    const noGameCut: SeasonPlayer = {
      id: "you-idle",
      name: "No Game Cut",
      teamAbbr: "CHI",
      positions: ["PF"],
      projections,
      shooting,
    }
    const playsCut: SeasonPlayer = {
      id: "you-play",
      name: "Plays Cut",
      teamAbbr: "ATL",
      positions: ["C"],
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

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))

    const selects = screen.getAllByRole("combobox", { name: /roster drop/i })
    expect(selects.length).toBeGreaterThan(0)

    const firstSelect = selects[0]!
    expect(firstSelect).toHaveValue("you-idle")
    fireEvent.change(firstSelect, { target: { value: "you-play" } })
    expect(firstSelect).toHaveValue("you-play")
  })

  it("rebuilds preview plan when roster drop override changes", () => {
    const onPreviewPlanChange = vi.fn()
    const noGameCut: SeasonPlayer = {
      id: "you-idle",
      name: "No Game Cut",
      teamAbbr: "CHI",
      positions: ["PF"],
      projections,
      shooting,
    }
    const playsCut: SeasonPlayer = {
      id: "you-play",
      name: "Plays Cut",
      teamAbbr: "ATL",
      positions: ["C"],
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

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))
    fireEvent.click(screen.getByRole("button", { name: /^2-spot$/i }))

    const initialPlan = onPreviewPlanChange.mock.calls.at(-1)?.[0]
    expect(initialPlan?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-idle")

    // Selects render 1-spot → 2-spot → 3-spot; index 1 is 2-spot spot 0.
    const twoSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop/i,
    })[1]!
    fireEvent.change(twoSpotSelect, { target: { value: "you-play" } })

    const rebuiltPlan = onPreviewPlanChange.mock.calls.at(-1)?.[0]
    expect(rebuiltPlan?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-play")
  })

  it("keeps roster drop overrides isolated per spot-count plan", () => {
    const onPreviewPlanChange = vi.fn()
    const noGameCut: SeasonPlayer = {
      id: "you-idle",
      name: "No Game Cut",
      teamAbbr: "CHI",
      positions: ["PF"],
      projections,
      shooting,
    }
    const playsCut: SeasonPlayer = {
      id: "you-play",
      name: "Plays Cut",
      teamAbbr: "ATL",
      positions: ["C"],
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

    render(
      <StreamingPlansPanel
        board={board}
        leagueId="lg1"
        onPreviewPlanChange={onPreviewPlanChange}
        playersById={{}}
        schedule={dropSchedule}
        state={dropState}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Aggressive" }))

    const oneSpotSelect = screen.getAllByRole("combobox", {
      name: /roster drop .* spot 1/i,
    })[0]!
    expect(oneSpotSelect).toHaveValue("you-idle")
    fireEvent.change(oneSpotSelect, { target: { value: "you-play" } })
    expect(oneSpotSelect).toHaveValue("you-play")

    fireEvent.click(screen.getByRole("button", { name: /^2-spot$/i }))
    const twoSpotPlan = onPreviewPlanChange.mock.calls.at(-1)?.[0]
    expect(twoSpotPlan?.spotCount).toBe(2)
    expect(twoSpotPlan?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-idle")
  })
})
