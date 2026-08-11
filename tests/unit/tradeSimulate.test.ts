import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { SeasonLeagueState } from "@/lib/season/types"
import { evaluateTrade, applyTradePackage } from "@/lib/trade/simulate"
import type { TradePackage } from "@/lib/trade/types"
import { buildPlayerValueMap } from "@/lib/trade/value"

const state = manualToSeasonLeagueState(fixture as ManualSeasonLeagueInput)

const playerIdsOf = (
  leagueState: SeasonLeagueState,
  teamIndex: number,
): string[] =>
  leagueState.teams[teamIndex].entries.flatMap(({ playerId }) =>
    playerId ? [playerId] : [])

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
    const { state: result } = applyTradePackage(state, {
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

  // The fixture rosters are full (14 filled slots, no nulls), which is the case
  // where the receiver of two players has to cut someone to fit them.
  it("drops the receiver's lowest-value player on a full-roster 2:1", () => {
    const tradePackage: TradePackage = {
      shape: "2:1",
      counterpartyTeamIndex: 0,
      youPlayerIds: ["t3p2", "t3p3"],
      themPlayerIds: ["t1p9"],
    }
    const values = buildPlayerValueMap(state)
    const receivingPlayerIdsBefore = playerIdsOf(state, 0)
    const expectedDropId = [...receivingPlayerIdsBefore]
      .filter((playerId) => playerId !== "t1p9")
      .sort((left, right) => values.get(left)! - values.get(right)!)[0]

    const { state: result, droppedPlayerId } = applyTradePackage(
      state,
      tradePackage,
    )
    const receivingPlayerIds = playerIdsOf(result, 0)
    const sendingPlayerIds = playerIdsOf(result, 2)

    expect(droppedPlayerId).toBe(expectedDropId)
    expect(receivingPlayerIds).toHaveLength(14)
    expect(receivingPlayerIds).not.toContain(droppedPlayerId)
    expect(receivingPlayerIds).toEqual(
      expect.arrayContaining(["t3p2", "t3p3"]),
    )
    // Only the recorded drop and the traded player leave the receiving roster.
    expect(
      receivingPlayerIdsBefore.filter(
        (playerId) => !receivingPlayerIds.includes(playerId),
      ),
    ).toEqual(expect.arrayContaining([droppedPlayerId!, "t1p9"]))
    expect(
      receivingPlayerIdsBefore.filter(
        (playerId) => !receivingPlayerIds.includes(playerId),
      ),
    ).toHaveLength(2)
    // The sending side is two out, one in, so it keeps one open slot.
    expect(sendingPlayerIds).toHaveLength(13)
    expect(result.teams[2].entries).toHaveLength(14)
  })

  it("keeps needs scores sensible after a full-roster 2:1 drop", () => {
    const result = evaluateTrade(state, {
      shape: "2:1",
      counterpartyTeamIndex: 0,
      youPlayerIds: ["t3p2", "t3p3"],
      themPlayerIds: ["t1p9"],
    })

    expect(result).not.toBeNull()
    expect(result!.droppedPlayerId).toBeDefined()
    expect(result!.you.categoryDeltas).toHaveLength(ALL_CATEGORY_IDS.length)
    for (const impact of [result!.you, result!.them]) {
      expect(impact.needsScoreBefore).toBeGreaterThanOrEqual(0)
      expect(impact.needsScoreAfter).toBeGreaterThanOrEqual(0)
      expect(impact.needsScoreAfter).toBeLessThanOrEqual(12)
      expect(
        impact.categoryDeltas.every(
          ({ rankBefore, rankAfter }) =>
            rankBefore >= 1 && rankBefore <= 12 && rankAfter >= 1
            && rankAfter <= 12,
        ),
      ).toBe(true)
    }
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
