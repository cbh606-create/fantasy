// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MatchupPlanBar } from "@/components/matchup/MatchupPlanBar"

describe("MatchupPlanBar", () => {
  afterEach(() => cleanup())

  it("lets you pick You and Opp plans", () => {
    const onYouSpotCountChange = vi.fn()
    const onOppSpotChoiceChange = vi.fn()
    render(
      <MatchupPlanBar
        openSeatCount={1}
        oppSpotChoice="auto"
        onOppSpotChoiceChange={onOppSpotChoiceChange}
        onYouSpotCountChange={onYouSpotCountChange}
        youSpotCount={null}
      />,
    )

    expect(screen.getByRole("button", { name: "You none" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: /Auto · 1 open/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: "You 2-spot" }))
    expect(onYouSpotCountChange).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole("button", { name: "Opp 3-spot" }))
    expect(onOppSpotChoiceChange).toHaveBeenCalledWith(3)
  })

  it("renders one Opp drop select per resolved spot and reports a player pick", () => {
    const onForcedOpponentRosterDropChange = vi.fn()
    render(
      <MatchupPlanBar
        openSeatCount={0}
        oppSpotChoice={2}
        onOppSpotChoiceChange={vi.fn()}
        onYouSpotCountChange={vi.fn()}
        youSpotCount={null}
        resolvedOppSpotCount={2}
        forcedOpponentRosterDrops={[null, null]}
        onForcedOpponentRosterDropChange={onForcedOpponentRosterDropChange}
        opponentEntries={[
          { slot: "PG", playerId: "r0" },
          { slot: "SG", playerId: "r1" },
          { slot: "IL", playerId: "il-1" },
        ]}
        playersById={{
          r0: {
            id: "r0",
            name: "Drop One",
            teamAbbr: "NYK",
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 5,
              AST: 2,
              STL: 1,
              BLK: 1,
              TO: 2,
              PTS: 10,
            },
            shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2 },
          },
          r1: {
            id: "r1",
            name: "Drop Two",
            teamAbbr: "BOS",
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 5,
              AST: 2,
              STL: 1,
              BLK: 1,
              TO: 2,
              PTS: 10,
            },
            shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2 },
          },
          "il-1": {
            id: "il-1",
            name: "Injured",
            teamAbbr: "CHI",
            projections: {
              FG_PCT: 0.5,
              FT_PCT: 0.8,
              TPM: 1,
              REB: 5,
              AST: 2,
              STL: 1,
              BLK: 1,
              TO: 2,
              PTS: 10,
            },
            shooting: { FGM: 4, FGA: 8, FTM: 2, FTA: 2 },
          },
        }}
      />,
    )

    const spot1 = screen.getByLabelText("Opp drop spot 1")
    const spot2 = screen.getByLabelText("Opp drop spot 2")
    expect(spot1).toHaveDisplayValue("Auto")
    expect(spot2).toHaveDisplayValue("Auto")
    expect(screen.queryByText("Injured")).not.toBeInTheDocument()
    fireEvent.change(spot1, { target: { value: "r0" } })
    expect(onForcedOpponentRosterDropChange).toHaveBeenCalledWith(0, "r0")
  })
})
