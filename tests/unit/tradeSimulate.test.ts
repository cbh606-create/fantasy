import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { evaluateTrade, applyTradePackage } from "@/lib/trade/simulate"
import type { TradePackage } from "@/lib/trade/types"

const state = manualToSeasonLeagueState(fixture as ManualSeasonLeagueInput)

describe("trade simulation", () => {
  it("improves the perspective team's AST rank after a 1:1 swap", () => {
    const tradePackage: TradePackage = {
      shape: "1:1",
      counterpartyTeamIndex: 0,
      youPlayerIds: ["t3p2"],
      themPlayerIds: ["t1p9"],
    }

    const result = evaluateTrade(state, tradePackage)
    const assistDelta = result?.you.categoryDeltas.find(
      ({ categoryId }) => categoryId === "AST",
    )

    expect(result).not.toBeNull()
    expect(assistDelta?.rankAfter).toBeLessThan(assistDelta?.rankBefore ?? 0)
    expect(result!.you.needsScoreAfter).toBeGreaterThan(
      result!.you.needsScoreBefore,
    )
  })

  it("applies a 2:1 package without mutating the source state", () => {
    const result = applyTradePackage(state, {
      shape: "2:1",
      counterpartyTeamIndex: 0,
      youPlayerIds: ["t3p2", "t3p3"],
      themPlayerIds: ["t1p9"],
    })
    const yourPlayerIds = result.teams[2].entries.map(({ playerId }) => playerId)
    const theirPlayerIds = result.teams[0].entries.map(({ playerId }) => playerId)

    expect(yourPlayerIds).toContain("t1p9")
    expect(yourPlayerIds).not.toContain("t3p2")
    expect(yourPlayerIds).not.toContain("t3p3")
    expect(theirPlayerIds).toContain("t3p2")
    expect(theirPlayerIds).toContain("t3p3")
    expect(theirPlayerIds).not.toContain("t1p9")
    expect(state.teams[2].entries.map(({ playerId }) => playerId)).toContain(
      "t3p2",
    )
  })

  it("returns null when a listed player is missing", () => {
    expect(
      evaluateTrade(state, {
        shape: "1:1",
        counterpartyTeamIndex: 0,
        youPlayerIds: ["missing"],
        themPlayerIds: ["t1p9"],
      }),
    ).toBeNull()
  })
})
