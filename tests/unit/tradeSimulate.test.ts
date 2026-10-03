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

  it("keeps the excluded player and puts the extra incoming player in the dropped slot", () => {
    const league = twoTeamState([18, 1, 12])
    const result = applyTradePackage(league, incoming, undefined, ["you-1"])

    expect(playerIdsOf(result.state, 0)).toContain("you-1")
    expect(playerIdsOf(result.state, 0)).not.toContain("you-2")
    expect(playerIdsOf(result.state, 0)).toEqual(
      expect.arrayContaining(["them-0", "them-1"]),
    )
  })

  it("never drops an IL player to make room", () => {
    const base = twoTeamState([18])
    const league: SeasonLeagueState = {
      ...base,
      players: [...base.players, rosterPlayer("you-il", 1)],
      teams: base.teams.map((team) =>
        team.teamIndex === 0
          ? {
            ...team,
            entries: [...team.entries, { slot: "IL" as const, playerId: "you-il" }],
          }
          : team),
    }
    const { droppedPlayerId, rejected, state: after } = applyTradePackage(
      league,
      incoming,
      undefined,
      [],
    )

    expect(droppedPlayerId).not.toBe("you-il")
    expect(rejected).toBeUndefined()
    expect(droppedPlayerId).toBe("them-1")
    expect(playerIdsOf(after, 0)).toContain("you-il")
  })

  it("rejects the package when every remaining player is excluded", () => {
    const league = twoTeamState([18, 1])
    const result = applyTradePackage(
      league,
      incoming,
      undefined,
      ["you-1"],
    )

    expect(result.rejected).toBe(true)
    expect(result.droppedPlayerId).toBeUndefined()
    expect(result.state).toBe(league)
    expect(playerIdsOf(result.state, 0)).toContain("you-0")
    expect(playerIdsOf(result.state, 1)).toContain("them-1")
  })

  it("ignores unknown excluded ids when the roster cannot fit another player", () => {
    const league = twoTeamState([18])
    const { droppedPlayerId, rejected } = applyTradePackage(
      league,
      incoming,
      undefined,
      ["not-a-player"],
    )

    expect(rejected).toBeUndefined()
    expect(droppedPlayerId).toBe("them-1")
  })

  it("drops the named player instead of the lowest-value teammate", () => {
    const league = twoTeamState([18, 1, 12])
    const result = applyTradePackage(league, incoming, undefined, [], {
      yourDropPlayerId: "you-2",
    })

    expect(result.rejected).toBeUndefined()
    expect(result.yourDroppedPlayerId).toBe("you-2")
    expect(result.droppedPlayerId).toBe("you-2")
    expect(playerIdsOf(result.state, 0)).toContain("you-1")
    expect(playerIdsOf(result.state, 0)).not.toContain("you-2")
  })

  it("uses an open non-IL slot before the named drop", () => {
    const league = twoTeamState([18, 1, 12])
    league.teams[0].entries.push({ slot: "IL", playerId: null })
    league.teams[0].entries.push({ slot: "BE", playerId: null })
    const result = applyTradePackage(league, incoming, undefined, [], {
      yourDropPlayerId: "you-2",
      skipEmptyIlSlots: true,
    })
    const entries = result.state.teams[0].entries

    expect(result.yourDroppedPlayerId).toBeUndefined()
    expect(result.droppedPlayerId).toBeUndefined()
    expect(entries.find((entry) => entry.slot === "IL")?.playerId).toBeNull()
    expect(entries.find((entry) => entry.slot === "BE")?.playerId).toBe("them-1")
    expect(playerIdsOf(result.state, 0)).toEqual(
      expect.arrayContaining(["you-1", "you-2", "them-0", "them-1"]),
    )
    expect(playerIdsOf(result.state, 0)).not.toContain("you-0")
  })

  it("does not use an empty IL slot when simulation skips IL", () => {
    const league = twoTeamState([18, 12])
    league.teams[0].entries.push({ slot: "IL", playerId: null })
    const result = applyTradePackage(league, incoming, undefined, [], {
      yourDropPlayerId: "you-1",
      skipEmptyIlSlots: true,
    })

    expect(result.yourDroppedPlayerId).toBe("you-1")
    expect(result.state.teams[0].entries.some((entry) =>
      entry.slot === "IL" && entry.playerId === null)).toBe(true)
  })

  it("rejects a named drop that is missing from the roster", () => {
    const league = twoTeamState([18, 1, 12])
    const result = applyTradePackage(league, incoming, undefined, [], {
      yourDropPlayerId: "missing",
    })

    expect(result.rejected).toBe(true)
    expect(result.yourDroppedPlayerId).toBeUndefined()
    expect(result.state).toBe(league)
    expect(playerIdsOf(result.state, 0)).toEqual(["you-0", "you-1", "you-2"])
    expect(playerIdsOf(result.state, 1)).toEqual(["them-0", "them-1"])
  })

  it("rejects a named drop that is on IL", () => {
    const league = twoTeamState([18, 1, 12])
    league.players.push(rosterPlayer("you-il", 1))
    league.teams[0].entries.push({ slot: "IL", playerId: "you-il" })
    const result = applyTradePackage(league, incoming, undefined, [], {
      yourDropPlayerId: "you-il",
    })

    expect(result.rejected).toBe(true)
    expect(result.yourDroppedPlayerId).toBeUndefined()
    expect(result.state).toBe(league)
    expect(playerIdsOf(result.state, 0)).toEqual([
      "you-0",
      "you-1",
      "you-2",
      "you-il",
    ])
    expect(playerIdsOf(result.state, 1)).toEqual(["them-0", "them-1"])
  })

  it("rejects a named drop that is one of the players being sent", () => {
    const league = twoTeamState([18, 1, 12])
    const result = applyTradePackage(league, incoming, undefined, [], {
      yourDropPlayerId: "you-0",
    })

    expect(result.rejected).toBe(true)
    expect(result.yourDroppedPlayerId).toBeUndefined()
    expect(result.state).toBe(league)
    expect(playerIdsOf(result.state, 0)).toEqual(["you-0", "you-1", "you-2"])
    expect(playerIdsOf(result.state, 1)).toEqual(["them-0", "them-1"])
  })

  it("skips the other team's empty IL slot and records their drop", () => {
    const league = twoTeamState([18, 12])
    const theirPlayers = [
      rosterPlayer("them-sent", 30),
      rosterPlayer("them-low", 1),
      rosterPlayer("them-mid", 15),
    ]
    league.players = [
      ...league.players.filter((player) => player.id.startsWith("you-")),
      ...theirPlayers,
    ]
    league.teams[1].entries = [
      { slot: "IL", playerId: null },
      { slot: "UTIL", playerId: "them-sent" },
      { slot: "UTIL", playerId: "them-low" },
      { slot: "UTIL", playerId: "them-mid" },
    ]
    const outgoing: TradePackage = {
      shape: "2:1",
      counterpartyTeamIndex: 1,
      youPlayerIds: ["you-0", "you-1"],
      themPlayerIds: ["them-sent"],
    }
    const values = buildPlayerValueMap(league)
    const expectedDropId = ["them-low", "them-mid"].sort(
      (left, right) => values.get(left)! - values.get(right)!,
    )[0]
    const keptId = ["them-low", "them-mid"].find((id) => id !== expectedDropId)
    const result = applyTradePackage(league, outgoing, undefined, [], {
      skipEmptyIlSlots: true,
    })

    expect(result.rejected).toBeUndefined()
    expect(result.theirDroppedPlayerId).toBe(expectedDropId)
    expect(result.state.teams[1].entries[0]).toEqual({
      slot: "IL",
      playerId: null,
    })
    expect(playerIdsOf(result.state, 1)).toEqual(
      expect.arrayContaining(["you-0", "you-1", keptId!]),
    )
    expect(playerIdsOf(result.state, 1)).not.toContain(expectedDropId)
    expect(playerIdsOf(result.state, 1)).not.toContain("them-sent")
  })
})
