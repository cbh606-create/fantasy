import { describe, expect, it } from "vitest"
import { carryForwardStreamerId } from "@/lib/matchup/streamingCarryForward"
import type { StreamingPlanDay, StreamingPlanDayCell } from "@/lib/matchup/types"

const cell = (
  spotIndex: number,
  partial: Partial<StreamingPlanDayCell> &
    Pick<StreamingPlanDayCell, "playerId" | "action">,
): StreamingPlanDayCell => ({
  spotIndex,
  droppedPlayerId: null,
  rosterDropPlayerId: null,
  rosterDropKind: "none",
  addIndex: null,
  alternativePlayerIds: [],
  targetCategoryIds: [],
  ...partial,
})

const days = (rows: Array<[string, StreamingPlanDayCell[]]>): StreamingPlanDay[] =>
  rows.map(([date, cells]) => ({ date, cells }))

describe("carryForwardStreamerId", () => {
  it("returns the cell player when present", () => {
    const planDays = days([
      ["2026-10-20", [cell(0, { playerId: "fa-a", action: "add" })]],
      ["2026-10-21", [cell(0, { playerId: null, action: "empty" })]],
    ])
    expect(carryForwardStreamerId(planDays, "2026-10-20", 0)).toBe("fa-a")
  })

  it("carries a prior streamer across empty days without a drop", () => {
    const planDays = days([
      ["2026-10-20", [cell(0, { playerId: "fa-a", action: "add" })]],
      ["2026-10-21", [cell(0, { playerId: "fa-a", action: "hold" })]],
      ["2026-10-22", [cell(0, { playerId: null, action: "empty" })]],
      ["2026-10-23", [cell(0, { playerId: null, action: "empty" })]],
    ])
    expect(carryForwardStreamerId(planDays, "2026-10-22", 0)).toBe("fa-a")
    expect(carryForwardStreamerId(planDays, "2026-10-23", 0)).toBe("fa-a")
  })

  it("stops carrying after that streamer is dropped", () => {
    const planDays = days([
      ["2026-10-20", [cell(0, { playerId: "fa-a", action: "add" })]],
      [
        "2026-10-21",
        [
          cell(0, {
            playerId: "fa-b",
            action: "drop_add",
            droppedPlayerId: "fa-a",
          }),
        ],
      ],
      ["2026-10-22", [cell(0, { playerId: null, action: "empty" })]],
    ])
    expect(carryForwardStreamerId(planDays, "2026-10-21", 0)).toBe("fa-b")
    expect(carryForwardStreamerId(planDays, "2026-10-22", 0)).toBe("fa-b")
  })

  it("stops carrying when a different add replaces without sharing the drop id", () => {
    const planDays = days([
      ["2026-10-20", [cell(0, { playerId: "fa-a", action: "add" })]],
      ["2026-10-21", [cell(0, { playerId: null, action: "empty" })]],
      ["2026-10-22", [cell(0, { playerId: "fa-b", action: "add" })]],
      ["2026-10-23", [cell(0, { playerId: null, action: "empty" })]],
    ])
    expect(carryForwardStreamerId(planDays, "2026-10-21", 0)).toBe("fa-a")
    expect(carryForwardStreamerId(planDays, "2026-10-23", 0)).toBe("fa-b")
  })

  it("returns null when the spot was never filled", () => {
    const planDays = days([
      ["2026-10-20", [cell(0, { playerId: null, action: "empty" })]],
      ["2026-10-21", [cell(0, { playerId: null, action: "empty" })]],
    ])
    expect(carryForwardStreamerId(planDays, "2026-10-21", 0)).toBeNull()
  })

  it("isolates carry-forward per spot index", () => {
    const planDays = days([
      [
        "2026-10-20",
        [
          cell(0, { playerId: "fa-a", action: "add" }),
          cell(1, { playerId: "fa-b", action: "add" }),
        ],
      ],
      [
        "2026-10-21",
        [
          cell(0, { playerId: null, action: "empty" }),
          cell(1, { playerId: null, action: "empty" }),
        ],
      ],
    ])
    expect(carryForwardStreamerId(planDays, "2026-10-21", 0)).toBe("fa-a")
    expect(carryForwardStreamerId(planDays, "2026-10-21", 1)).toBe("fa-b")
  })
})
