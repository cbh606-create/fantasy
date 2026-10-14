// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CategoryZScale } from "@/components/season/CategoryZScale"
import { LeagueRankMatrix } from "@/components/season/LeagueRankMatrix"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonAnalysis } from "@/lib/season/analysis"
import type { SeasonTeamRoster } from "@/lib/season/types"

const teams: SeasonTeamRoster[] = [
  { teamIndex: 0, name: "Mine", entries: [] },
  { teamIndex: 1, name: "Alpha", entries: [] },
  { teamIndex: 2, name: "Beta", entries: [] },
]

const rowsFor = (categoryId: CategoryId, rebTied: boolean) => {
  if (categoryId === "REB" && rebTied) {
    return [
      { teamIndex: 0, rank: 1, z: 1.15, raw: 42.1 },
      { teamIndex: 1, rank: 2, z: 1.15, raw: 40 },
      { teamIndex: 2, rank: 3, z: -0.2, raw: 30 },
    ]
  }

  if (categoryId === "REB") return []

  return [
    { teamIndex: 0, rank: 1, z: 0.2, raw: 1 },
    { teamIndex: 1, rank: 2, z: -1.4, raw: 1 },
    { teamIndex: 2, rank: 3, z: 0.4, raw: 1 },
  ]
}

const analysisWith = (rebTied: boolean): SeasonAnalysis => ({
  byTeam: [],
  byCategory: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    rows: rowsFor(categoryId, rebTied),
  })),
  overall: {
    rows: [
      { teamIndex: 0, rank: 1, rankSum: 20 },
      { teamIndex: 1, rank: 2, rankSum: 30 },
      { teamIndex: 2, rank: 3, rankSum: 40 },
    ],
  },
})

const renderMatrix = (rebTied: boolean) =>
  render(
    <LeagueRankMatrix
      analysis={analysisWith(rebTied)}
      perspectiveTeamIndex={0}
      teams={teams}
    />,
  )

describe("LeagueRankMatrix z row", () => {
  afterEach(() => {
    document.body.style.overflow = ""
    cleanup()
  })

  it("renders a z button for each category and a dash for overall", () => {
    renderMatrix(true)
    const zRow = screen.getByRole("rowheader", { name: "Z" }).closest("tr")
    if (!zRow) throw new Error("missing z row")
    const cells = within(zRow).getAllByRole("cell")

    expect(cells[0]).toHaveTextContent("—")
    expect(within(zRow).getAllByRole("button", { name: /league z$/ })).toHaveLength(9)
    expect(screen.getByRole("button", { name: "Show REB league z" })).toBeInTheDocument()
  })

  it("keeps the z row last after a sort", () => {
    renderMatrix(true)
    fireEvent.click(screen.getByRole("button", { name: "Sort by PTS, best first" }))
    const rows = screen.getAllByRole("row")

    expect(rows[rows.length - 1]?.querySelector("th")?.textContent).toBe("Z")
  })

  it("renders a dash instead of a button when a category has no rows", () => {
    renderMatrix(false)

    expect(screen.queryByRole("button", { name: "Show REB league z" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /league z$/ })).toHaveLength(8)
  })

  it("opens the category dialog and restores focus and overflow on escape", () => {
    document.body.style.overflow = "auto"
    renderMatrix(true)
    const reb = screen.getByRole("button", { name: "Show REB league z" })
    fireEvent.click(reb)

    expect(screen.getByRole("heading", { name: "REB" })).toBeInTheDocument()
    expect(
      Array.from(document.querySelectorAll("text")).some(
        (node) => node.textContent === "YOU · 42.1 · +1.15",
      ),
    ).toBe(true)
    expect(document.body.style.overflow).toBe("hidden")
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()
    expect(screen.getByTestId("z-dot-0").getAttribute("data-y")).not.toBe(
      screen.getByTestId("z-dot-1").getAttribute("data-y"),
    )

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    const dotButtons = screen.getAllByRole("button", { name: /, z / })
    expect(dotButtons[dotButtons.length - 1]).toHaveFocus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(reb).toHaveFocus()
    expect(document.body.style.overflow).toBe("auto")
  })

  it("closes when the scrim is pressed", () => {
    renderMatrix(true)
    fireEvent.click(screen.getByRole("button", { name: "Show FG% league z" }))
    fireEvent.mouseDown(screen.getByRole("dialog"))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("focuses the first dialog control on Tab when focus left the panel", () => {
    renderMatrix(true)
    fireEvent.click(screen.getByRole("button", { name: "Show REB league z" }))
    const close = screen.getByRole("button", { name: "Close" })
    close.blur()
    expect(document.activeElement).not.toBe(close)

    fireEvent.keyDown(document, { key: "Tab" })

    expect(close).toHaveFocus()
  })

  it("places a lower dot's name below the dot", () => {
    render(
      <CategoryZScale
        categoryId="REB"
        dots={[
          { teamIndex: 1, name: "Alpha", raw: 40, z: 0, isYou: false },
          { teamIndex: 2, name: "Beta", raw: 30, z: 0, isYou: false },
          { teamIndex: 3, name: "Gamma", raw: 20, z: 0, isYou: false },
        ]}
        mode="expanded"
      />,
    )

    const lower = screen.getByTestId("z-dot-3")
    const upper = screen.getByTestId("z-dot-2")

    expect(Number(lower.getAttribute("data-y"))).toBeGreaterThan(64)
    expect(lower.querySelector("span")?.className).toContain("top-full")
    expect(Number(upper.getAttribute("data-y"))).toBeLessThan(64)
    expect(upper.querySelector("span")?.className).toContain("bottom-full")
  })
})

const teamsOverallFixture: SeasonTeamRoster[] = [
  { teamIndex: 0, name: "Mine", entries: [] },
  { teamIndex: 1, name: "Alpha", entries: [] },
  { teamIndex: 2, name: "Leader", entries: [] },
]

const analysisOverallFixture = (): SeasonAnalysis => ({
  byTeam: [],
  byCategory: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    rows: [
      { teamIndex: 0, rank: 2, z: 0.2, raw: 1 },
      { teamIndex: 1, rank: 3, z: -1.4, raw: 1 },
      { teamIndex: 2, rank: 1, z: 0.4, raw: 1 },
    ],
  })),
  overall: {
    rows: [
      { teamIndex: 2, rank: 1, rankSum: 20 },
      { teamIndex: 0, rank: 2, rankSum: 30 },
      { teamIndex: 1, rank: 3, rankSum: 40 },
    ],
  },
})

describe("LeagueRankMatrix overall column", () => {
  afterEach(() => {
    cleanup()
  })

  it("sorts by overall rank so rank-1 team is first even when not first in teams", () => {
    render(
      <LeagueRankMatrix
        analysis={analysisOverallFixture()}
        perspectiveTeamIndex={0}
        teams={teamsOverallFixture}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Sort by Overall, best first" }),
    )

    const tbody = document.querySelector("tbody")
    if (!tbody) throw new Error("missing tbody")
    const firstTeamRow = within(tbody as HTMLElement).getAllByRole("row")[0]
    expect(within(firstTeamRow).getByRole("rowheader")).toHaveTextContent(
      "Leader",
    )
  })

  it("shows rank sum in the overall cell title", () => {
    render(
      <LeagueRankMatrix
        analysis={analysisOverallFixture()}
        perspectiveTeamIndex={0}
        teams={teamsOverallFixture}
      />,
    )

    expect(
      screen.getByTitle("Rank sum 20 (lower is better)"),
    ).toBeInTheDocument()
  })
})

describe("LeagueRankMatrix rank basis", () => {
  afterEach(() => {
    document.body.style.overflow = ""
    cleanup()
  })

  it("switches ranks, sort totals, and the z row to per game", () => {
    const perGame = analysisWith(true)
    const pts = perGame.byCategory.find((category) => category.categoryId === "PTS")
    if (!pts) throw new Error("missing PTS")
    pts.rows = [
      { teamIndex: 1, rank: 1, z: 1.5, raw: 30 },
      { teamIndex: 2, rank: 2, z: 0, raw: 20 },
      { teamIndex: 0, rank: 3, z: -1.5, raw: 10 },
    ]
    perGame.overall = {
      rows: [
        { teamIndex: 1, rank: 1, rankSum: 12 },
        { teamIndex: 2, rank: 2, rankSum: 18 },
        { teamIndex: 0, rank: 3, rankSum: 24 },
      ],
    }

    render(
      <LeagueRankMatrix
        analysis={analysisWith(true)}
        perGameAnalysis={perGame}
        perspectiveTeamIndex={0}
        teams={teams}
      />,
    )

    const youPts = () => {
      const row = screen.getByRole("rowheader", { name: "YOU" }).closest("tr")
      if (!row) throw new Error("missing you row")
      return within(row).getAllByRole("cell").at(-1)
    }

    expect(youPts()).toHaveTextContent("#1")
    fireEvent.click(screen.getByRole("radio", { name: "Per game" }))
    expect(youPts()).toHaveTextContent("#3")
    expect(screen.getByTitle("Rank sum 24 (lower is better)")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Total" }))
    expect(youPts()).toHaveTextContent("#1")

    fireEvent.click(screen.getByRole("radio", { name: "Per game" }))
    fireEvent.click(screen.getByRole("button", { name: "Show PTS league z" }))
    expect(screen.getByText("YOU · 10.0 · -1.50")).toBeInTheDocument()
  })
})
