import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import {
  ALL_CATEGORY_IDS,
  defaultCategorySettings,
} from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
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
  it("evaluates a 1:1 swap and returns category deltas for both sides", () => {
    const tradePackage: TradePackage = {
      shape: "1:1",
      counterpartyTeamIndex: 0,
      youPlayerIds: ["t3p2"],
      themPlayerIds: ["t1p9"],
    }

    const result = evaluateTrade(state, tradePackage)

    expect(result).not.toBeNull()
    expect(result!.you.categoryDeltas).toHaveLength(ALL_CATEGORY_IDS.length)
    expect(result!.them.categoryDeltas).toHaveLength(ALL_CATEGORY_IDS.length)
    expect(result!.you.needsScoreBefore).toBeGreaterThanOrEqual(0)
    expect(result!.them.needsScoreBefore).toBeGreaterThanOrEqual(0)
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

const projectionBase: Record<CategoryId, number> = {
  FG_PCT: 0.5,
  FT_PCT: 0.75,
  TPM: 2,
  REB: 8,
  AST: 8,
  STL: 2,
  BLK: 1,
  TO: 4,
  PTS: 18,
}

const rosterPlayer = (
  id: string,
  points: number,
): SeasonPlayer => ({
  id,
  name: id,
  projections: { ...projectionBase, PTS: points },
  shooting: { FGM: 5, FGA: 10, FTM: 8, FTA: 10 },
})

const twoTeamState = (yourPoints: number[]): SeasonLeagueState => {
  const yourPlayers = yourPoints.map((points, index) =>
    rosterPlayer(`you-${index}`, points))
  const theirPlayers = [
    rosterPlayer("them-0", 20),
    rosterPlayer("them-1", 20),
  ]
  const rosters = [yourPlayers, theirPlayers]

  return {
    name: "Drop exclusion",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: rosters.map((teamPlayers, teamIndex) => ({
      teamIndex,
      name: `Team ${teamIndex}`,
      entries: teamPlayers.map((player) => ({
        slot: "UTIL" as const,
        playerId: player.id,
      })),
    })),
    players: rosters.flat(),
    availablePlayerIds: [],
    waiverOrder: [0, 1],
    source: "manual",
  }
}

describe("applyTradePackage excluded drops", () => {
  const incoming: TradePackage = {
    shape: "1:2",
    counterpartyTeamIndex: 1,
    youPlayerIds: ["you-0"],
    themPlayerIds: ["them-0", "them-1"],
  }

  it("drops the next included player when the lowest is excluded", () => {
    const league = twoTeamState([18, 1, 12])
    const { droppedPlayerId, rejected } = applyTradePackage(
      league,
      incoming,
      undefined,
      ["you-1"],
    )

    expect(rejected).toBeUndefined()
    expect(droppedPlayerId).toBe("you-2")
  })

  it("rejects the package when every remaining player is excluded", () => {
    const league = twoTeamState([18, 1])
    const { rejected, droppedPlayerId } = applyTradePackage(
      league,
      incoming,
      undefined,
      ["you-1"],
    )

    expect(rejected).toBe(true)
    expect(droppedPlayerId).toBeUndefined()
  })
})
