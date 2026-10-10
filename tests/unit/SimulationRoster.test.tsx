// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SimulationRoster } from "@/components/trade/SimulationRoster"

afterEach(() => {
  cleanup()
})

const players = [
  { id: "123", name: "Photo Guard" },
  { id: "give-1", name: "Your Guard" },
]

describe("SimulationRoster", () => {
  it("lists players vertically with a photo or initials", () => {
    render(
      <SimulationRoster
        label="My Team"
        onPress={vi.fn()}
        players={players}
        pressedIds={[]}
      />,
    )

    const group = screen.getByRole("group", { name: "My Team" })
    const buttons = within(group).getAllByRole("button")

    expect(buttons[0]).toHaveAccessibleName("Photo Guard")
    expect(buttons[1]).toHaveAccessibleName("Your Guard")
    expect(group.querySelector("img")).toHaveAttribute(
      "src",
      "https://a.espncdn.com/i/headshots/nba/players/full/123.png",
    )
    expect(within(group).getByText("YG")).toBeInTheDocument()
    expect(group).toHaveClass("flex-col")
  })

  it("presses at the row and offers Drop only for a droppable player", () => {
    const onPress = vi.fn()
    const onDrop = vi.fn()
    render(
      <SimulationRoster
        dropId={null}
        droppableIds={["give-1"]}
        label="My Team"
        onDrop={onDrop}
        onPress={onPress}
        players={players}
        pressedIds={["123"]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Photo Guard" }))
    fireEvent.click(screen.getByRole("button", { name: "Drop" }))

    expect(onPress).toHaveBeenCalledWith("123")
    expect(onDrop).toHaveBeenCalledWith("give-1")
    expect(screen.getAllByRole("button", { name: "Drop" })).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Photo Guard" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Your Guard" })).toHaveAttribute("aria-pressed", "false")
  })

  it("hides Drop on a pressed droppable player but shows it when unpressed", () => {
    const { rerender } = render(
      <SimulationRoster
        droppableIds={["give-1"]}
        label="My Team"
        onDrop={vi.fn()}
        onPress={vi.fn()}
        players={players}
        pressedIds={["give-1"]}
      />,
    )

    expect(screen.queryByRole("button", { name: "Drop" })).toBeNull()

    rerender(
      <SimulationRoster
        droppableIds={["give-1"]}
        label="My Team"
        onDrop={vi.fn()}
        onPress={vi.fn()}
        players={players}
        pressedIds={[]}
      />,
    )

    expect(screen.getByRole("button", { name: "Drop" })).toBeInTheDocument()
  })

  it("chooses the other team from one select", () => {
    const onTeamChange = vi.fn()
    render(
      <SimulationRoster
        label="Rivals"
        onPress={vi.fn()}
        onTeamChange={onTeamChange}
        players={[]}
        pressedIds={[]}
        teamIndex={null}
        teamOptions={[{ teamIndex: 1, name: "Rivals" }]}
      />,
    )

    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "1" } })

    expect(onTeamChange).toHaveBeenCalledWith(1)
    expect(screen.queryByRole("button", { name: "Rivals" })).toBeNull()
  })
})
