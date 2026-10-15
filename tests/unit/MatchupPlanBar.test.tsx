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

  it("marks the recommended You spot with Rec and expected wins", () => {
    render(
      <YouSpotToggle
        onYouSpotCountChange={vi.fn()}
        recommendedYouSpot={2}
        youSpotCount={2}
        youSpotScores={[
          { spot: null, gameStarts: 40, addsUsed: 0, projectedCatWins: 3.1 },
          { spot: 1, gameStarts: 44, addsUsed: 3, projectedCatWins: 3.4 },
          { spot: 2, gameStarts: 48, addsUsed: 5, projectedCatWins: 3.97 },
          { spot: 3, gameStarts: 46, addsUsed: 6, projectedCatWins: 3.6 },
        ]}
      />,
    )

    expect(
      screen.getByRole("button", { name: "You 2-spot recommended 3.97" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "You 2-spot recommended 3.97" })).toHaveTextContent(
      "2-spot Rec · 3.97",
    )
    expect(screen.getByRole("button", { name: "You none 3.10" })).toHaveTextContent(
      "None · 3.10",
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
        oppSpotChoice={1}
        onOppSpotChoiceChange={onOppSpotChoiceChange}
        statWindow="season"
        onStatWindowChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Opp 1-spot" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(
      screen.queryByRole("button", { name: /Auto/i }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Opp 3-spot" }))
    expect(onOppSpotChoiceChange).toHaveBeenCalledWith(3)
    expect(screen.getByLabelText("Matchup plans")).toHaveClass("flex-row")
  })

  it("shows team starts on each Opp spot like You", () => {
    render(
      <MatchupPlanBar
        {...youBarProps}
        oppSpotChoice={2}
        onOppSpotChoiceChange={vi.fn()}
        oppSpotScores={[
          { spot: 0, gameStarts: 36 },
          { spot: 1, gameStarts: 40 },
          { spot: 2, gameStarts: 42 },
          { spot: 3, gameStarts: 42 },
        ]}
        statWindow="season"
        onStatWindowChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Opp 0-spot 36" })).toHaveTextContent(
      "0-spot · 36",
    )
    expect(screen.getByRole("button", { name: "Opp 2-spot 42" })).toHaveTextContent(
      "2-spot · 42",
    )
    expect(screen.getByRole("button", { name: "Opp 2-spot 42" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("exposes an Opp 0-spot idle option", () => {
    const onOppSpotChoiceChange = vi.fn()
    render(
      <MatchupPlanBar
        {...youBarProps}
        oppSpotChoice={0}
        onOppSpotChoiceChange={onOppSpotChoiceChange}
        resolvedOppSpotCount={0}
        statWindow="season"
        onStatWindowChange={vi.fn()}
      />,
    )

    const idle = screen.getByRole("button", { name: "Opp 0-spot" })
    expect(idle).toBeInTheDocument()
    expect(idle).toHaveAttribute("aria-pressed", "true")
    expect(idle).toHaveTextContent("0-spot")
    fireEvent.click(idle)
    expect(onOppSpotChoiceChange).toHaveBeenCalledWith(0)

    const drop = screen.getByLabelText("Opp drop spot 1")
    expect(drop).toBeDisabled()
    expect(screen.getByText("Opp drop").parentElement).toHaveAttribute(
      "aria-disabled",
      "true",
    )
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
        oppSpotChoice={0}
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
        oppSpotChoice={0}
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
