// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  MatchupPlanBar,
  YouSpotToggle,
} from "@/components/matchup/MatchupPlanBar"

const youBarProps = {
  onYouSpotCountChange: vi.fn(),
  youSpotCount: null as const,
}

describe("MatchupPlanBar", () => {
  afterEach(() => cleanup())

  it("marks the recommended You spot with Rec and team starts", () => {
    render(
      <YouSpotToggle
        onYouSpotCountChange={vi.fn()}
        recommendedYouSpot={2}
        youSpotCount={2}
        youSpotScores={[
          { spot: null, gameStarts: 40, addsUsed: 0 },
          { spot: 1, gameStarts: 44, addsUsed: 3 },
          { spot: 2, gameStarts: 48, addsUsed: 5 },
          { spot: 3, gameStarts: 46, addsUsed: 6 },
        ]}
      />,
    )

    expect(
      screen.getByRole("button", { name: "You 2-spot recommended 48" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "You 2-spot recommended 48" })).toHaveTextContent(
      "2-spot Rec · 48",
    )
    expect(screen.getByRole("button", { name: "You none 40" })).toHaveTextContent(
      "None · 40",
    )
    expect(
      screen.queryByRole("button", { name: /You 1-spot recommended/ }),
    ).not.toBeInTheDocument()
  })

  it("lets you pick Opp plans", () => {
    const onOppSpotChoiceChange = vi.fn()
    render(
      <MatchupPlanBar
        {...youBarProps}
        openSeatCount={1}
        oppSpotChoice="auto"
        onOppSpotChoiceChange={onOppSpotChoiceChange}
        statWindow="season"
        onStatWindowChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: /Auto · 1/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: "Opp 3-spot" }))
    expect(onOppSpotChoiceChange).toHaveBeenCalledWith(3)
    expect(screen.getByLabelText("Matchup plans")).toHaveClass("flex-row")
  })

  it("lets you pick a You spot", () => {
    const onYouSpotCountChange = vi.fn()
    render(
      <YouSpotToggle
        onYouSpotCountChange={onYouSpotCountChange}
        youSpotCount={null}
      />,
    )
    expect(screen.getByRole("button", { name: "You none" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: "You 2-spot" }))
    expect(onYouSpotCountChange).toHaveBeenCalledWith(2)
  })

  it("renders one Opp drop select per resolved spot and reports a player pick", () => {
    const onForcedOpponentRosterDropChange = vi.fn()
    render(
      <MatchupPlanBar
        {...youBarProps}
        openSeatCount={0}
        oppSpotChoice={2}
        onOppSpotChoiceChange={vi.fn()}
        statWindow="season"
        onStatWindowChange={vi.fn()}
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
    const plans = screen.getByLabelText("Matchup plans")
    const oppDropRow = screen.getByText("Opp drop").parentElement
    expect(oppDropRow?.parentElement).toBe(plans)
    expect(screen.getByText("Opp").parentElement).not.toBe(oppDropRow)
    expect(screen.queryByText("Injured")).not.toBeInTheDocument()
    fireEvent.change(spot1, { target: { value: "r0" } })
    expect(onForcedOpponentRosterDropChange).toHaveBeenCalledWith(0, "r0")
  })

  it("lists Season Last 7 Last 15 and Last 30 options", () => {
    render(
      <MatchupPlanBar
        {...youBarProps}
        openSeatCount={1}
        oppSpotChoice="auto"
        onOppSpotChoiceChange={vi.fn()}
        statWindow="season"
        onStatWindowChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("option", { name: "Season" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Last 7 days" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Last 15 days" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Last 30 days" })).toBeInTheDocument()
  })

  it("reports a Stat window change", () => {
    const onStatWindowChange = vi.fn()
    render(
      <MatchupPlanBar
        {...youBarProps}
        openSeatCount={1}
        oppSpotChoice="auto"
        onOppSpotChoiceChange={vi.fn()}
        statWindow="season"
        onStatWindowChange={onStatWindowChange}
      />,
    )
    fireEvent.change(screen.getByLabelText("Stat window"), {
      target: { value: "l15" },
    })
    expect(onStatWindowChange).toHaveBeenCalledWith("l15")
  })
})
