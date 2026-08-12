import { describe, expect, it } from "vitest"
import {
  teamIndexForOverall,
  buildEmptyBoard,
  isUserTurn,
  overallForTeamRound,
} from "@/lib/domain/snake"

describe("teamIndexForOverall", () => {
  it("snakes across 12 teams", () => {
    expect(teamIndexForOverall(1, 12)).toBe(0)
    expect(teamIndexForOverall(12, 12)).toBe(11)
    expect(teamIndexForOverall(13, 12)).toBe(11)
    expect(teamIndexForOverall(24, 12)).toBe(0)
  })
})

describe("buildEmptyBoard", () => {
  it("creates teams*rounds null picks starting at overall 1", () => {
    const board = buildEmptyBoard(12, 13)
    expect(board.picks).toHaveLength(156)
    expect(board.currentOverall).toBe(1)
    expect(board.picks[0]).toEqual({
      overall: 1,
      round: 1,
      teamIndex: 0,
      playerId: null,
    })
  })
})

describe("isUserTurn", () => {
  it("is true when current overall maps to the perspective team", () => {
    const board = buildEmptyBoard(12, 13)
    expect(isUserTurn(board, 0, 12)).toBe(true)
    board.currentOverall = 2
    expect(isUserTurn(board, 0, 12)).toBe(false)
  })
})

describe("overallForTeamRound", () => {
  it("keeps team columns fixed across snake rounds", () => {
    expect(overallForTeamRound(1, 0, 12)).toBe(1)
    expect(overallForTeamRound(1, 11, 12)).toBe(12)
    expect(overallForTeamRound(2, 11, 12)).toBe(13)
    expect(overallForTeamRound(2, 0, 12)).toBe(24)
  })
})
