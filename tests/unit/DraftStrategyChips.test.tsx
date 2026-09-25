// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DraftStrategyChips } from "@/components/draft/DraftStrategyChips"

afterEach(() => {
  cleanup()
})

describe("DraftStrategyChips", () => {
  it("renders Punt and Focus rows and toggles focus via onStrategyChange", () => {
    const onStrategyChange = vi.fn()

    render(
      <DraftStrategyChips
        focusCategoryIds={[]}
        onStrategyChange={onStrategyChange}
        puntCategoryIds={[]}
      />,
    )

    expect(screen.getByText("Punt")).toBeInTheDocument()
    expect(screen.getByText("Focus")).toBeInTheDocument()
    expect(screen.queryByText("Prep")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Focus TO" }))

    expect(onStrategyChange).toHaveBeenCalledWith({
      puntCategoryIds: [],
      focusCategoryIds: ["TO"],
    })
  })

  it("makes punt and focus mutually exclusive", () => {
    const onStrategyChange = vi.fn()

    render(
      <DraftStrategyChips
        focusCategoryIds={["AST"]}
        onStrategyChange={onStrategyChange}
        puntCategoryIds={[]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Punt AST" }))

    expect(onStrategyChange).toHaveBeenCalledWith({
      puntCategoryIds: ["AST"],
      focusCategoryIds: [],
    })
  })
})
