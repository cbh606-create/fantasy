// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StreamingPlansPanel } from "@/components/matchup/StreamingPlansPanel"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { DailyLineups } from "@/lib/matchup/dailyLineups"
import { suggestStreamingDrop } from "@/lib/matchup/streamingDropExplain"
import type { MatchupBoard, StreamingPlan } from "@/lib/matchup/types"
import { formatMatchupDayLabel } from "@/lib/matchup/weekCalendarLayout"
import type {
  ScheduleResponse,
  SeasonLeagueState,
  SeasonPlayer,
} from "@/lib/season/types"

vi.mock("@/lib/matchup/streamingDropExplain", { spy: true })

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
    expect(monday?.closest("th")).toHaveClass("w-[6.75rem]", "min-w-[6.75rem]")
    expect(screen.getAllByRole("columnheader", { name: /^Move$/i })[0]).toHaveClass(
      "w-28",
      "min-w-28",
      "max-w-28",
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

  it("hides ADP-protected players from today's dropbox", () => {
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
    const select = screen.getAllByRole("combobox", { name: /Roster drop/i })[0]
    expect(select).toHaveTextContent("Scrub")
    expect(select).not.toHaveTextContent("Star")
  })

  it("shows a Hold dropbox only on today and chips on a chosen drop", () => {
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
    const todaySelect = screen.getAllByRole("combobox", {
      name: /Roster drop.*spot 1/i,
    })
    expect(todaySelect.length).toBeGreaterThan(0)
    expect(todaySelect[0]).toHaveDisplayValue("Open slot")
    expect(
      screen.queryByRole("combobox", {
        name: new RegExp(formatMatchupDayLabel("2025-11-04"), "i"),
      }),
    ).not.toBeInTheDocument()

    fireEvent.change(todaySelect[0]!, { target: { value: "you-1" } })
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
    expect(firstSelect.parentElement).toHaveClass("block", "w-full")
    expect(firstSelect.parentElement).not.toHaveClass("inline-flex")
    expect(firstSelect).toHaveValue("you-idle")
    fireEvent.change(firstSelect, { target: { value: "you-idle" } })
    expect(firstSelect).toHaveValue("you-idle")
    fireEvent.change(firstSelect, { target: { value: "you-play" } })
    expect(firstSelect).toHaveValue("you-play")
  })

  it("shows the dropbox on the first matchup day when today is before the week", () => {
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

    const selects = screen.getAllByRole("combobox", { name: /Roster drop/i })
    expect(selects.length).toBeGreaterThan(0)
    expect(selects[0]).toHaveValue("open_slot")

    const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
      "tr",
    )!
    expect(dropRow.querySelectorAll("td")[0]!.querySelector("select")).not.toBeNull()
    expect(dropRow.querySelectorAll("td")[1]!.querySelector("select")).toBeNull()
    expect(dropRow.querySelectorAll("td")[1]!.textContent?.trim()).not.toBe("—")
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
    fireEvent.change(oneSpotSelect, { target: { value: "you-idle" } })

    const previewed = onPreviewPlanChange.mock.calls.at(-1)?.[0] as StreamingPlan
    expect(previewed?.spotCount).toBe(1)
    expect(previewed?.days[0]?.cells[0]?.rosterDropPlayerId).toBe("you-idle")
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

  it("shows a suggested drop tooltip on hover of a future Drop cell when daily is passed", () => {
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
    expect(futureCell.querySelector("select")).toBeNull()
    fireEvent.mouseEnter(futureCell.querySelector("span")!)

    expect(screen.getByRole("tooltip")).toHaveTextContent(/Suggested drop:/)
  })

  it("forwards statWindow to suggestStreamingDrop", () => {
    vi.mocked(suggestStreamingDrop).mockClear()
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
        statWindow="l15"
        today="2025-11-03"
      />,
    )

    const dropRow = screen.getAllByRole("rowheader", { name: /^Drop$/i })[0]!.closest(
      "tr",
    )!
    const futureCell = dropRow.querySelectorAll("td")[1]!
    fireEvent.mouseEnter(futureCell.querySelector("span")!)

    expect(suggestStreamingDrop).toHaveBeenCalledWith(
      expect.objectContaining({ statWindow: "l15" }),
    )
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

  it("still exposes a dropbox only on the first day of a future week", () => {
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
    expect(dropRow.querySelectorAll("td")[1]!.querySelector("select")).toBeNull()
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

  it("keeps today's dropbox on the chosen player when a streamer is already seated", () => {
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
    expect(todaySelect).toHaveDisplayValue("Hold")
    fireEvent.change(todaySelect, { target: { value: "you-1" } })
    expect(todaySelect).toHaveValue("you-1")
  })
})
