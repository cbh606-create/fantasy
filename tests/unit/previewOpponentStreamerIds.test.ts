import { describe, expect, it } from "vitest"
import { previewOpponentStreamerIds } from "@/lib/matchup/applyStreamingPlanPreview"
import type { StreamingPlan } from "@/lib/matchup/types"

describe("previewOpponentStreamerIds", () => {
  it("collects opponent streamer ids from opponentDays cells", () => {
    const plan = {
      opponentDays: [
        {
          date: "2026-10-20",
          streamerPlayerId: "fa-a",
          droppedPlayerId: "cut",
          rosterGameCount: 2,
          cells: [
            { spotIndex: 0, playerId: "fa-a", action: "add" },
            { spotIndex: 1, playerId: "fa-b", action: "add" },
          ],
        },
      ],
    } as StreamingPlan

    expect([...previewOpponentStreamerIds(plan)].sort()).toEqual([
      "fa-a",
      "fa-b",
    ])
  })
})
