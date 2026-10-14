// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PlayerRosterTable } from "@/components/season/PlayerRosterTable"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonPlayer } from "@/lib/season/types"

const projections = (
  overrides: Partial<Record<CategoryId, number>>,
): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, overrides[categoryId] ?? 0]),
  ) as Record<CategoryId, number>

const volumePlayer: SeasonPlayer = {
  id: "volume",
  name: "Volume",
  projections: projections({
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 160,
    PTS: 1600,
  }),
  projectedGames: 80,
  shooting: { FGM: 800, FGA: 1600, FTM: 400, FTA: 500 },
}

const ratePlayer: SeasonPlayer = {
  id: "rate",
  name: "Rate",
  projections: projections({ FG_PCT: 0.45, FT_PCT: 0.75, PTS: 20, REB: 8 }),
  shooting: { FGM: 8, FGA: 16, FTM: 4, FTA: 5 },
}

const renderTable = () =>
  render(
    <PlayerRosterTable
      entries={[
        { slot: "C", playerId: "volume" },
        { slot: "BE", playerId: "rate" },
      ]}
      isEditing={false}
      onPlayerChange={() => {}}
      players={[volumePlayer, ratePlayer]}
    />,
  )

describe("PlayerRosterTable stat basis", () => {
  afterEach(() => {
    cleanup()
  })

  it("switches counting stats and shot volume to per game and keeps percentages", () => {
    renderTable()

    expect(screen.getByRole("radio", { name: "Total" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.getByText("1600.0")).toBeInTheDocument()
    expect(screen.getByText("800.0/1600.0")).toBeInTheDocument()
    expect(screen.getByText("50.0%")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("radio", { name: "Per game" }))

    expect(screen.getByRole("radio", { name: "Per game" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.queryByText("1600.0")).not.toBeInTheDocument()
    expect(screen.getAllByText("20.0")).toHaveLength(2)
    expect(screen.getByText("10.0/20.0")).toBeInTheDocument()
    expect(screen.getByText("2.0")).toBeInTheDocument()
    expect(screen.getByText("50.0%")).toBeInTheDocument()
    expect(screen.getByText("8.0")).toBeInTheDocument()
  })
})
