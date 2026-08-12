import { describe, expect, it } from "vitest"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type { Player } from "@/lib/domain/types"
import { buildMockCategoryRankReport } from "@/lib/draft/mockCategoryRanks"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 5,
  AST: 4,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 20,
}

const player = (
  id: string,
  overrides: Partial<Player["projections"]> = {},
): Player => ({
  id,
  name: id,
  positions: ["SF"],
  adp: 1,
  projections: { ...projections, ...overrides },
})

describe("buildMockCategoryRankReport", () => {
  it("ranks counting cats high-to-low and TO low-to-high", () => {
    const board = buildEmptyBoard(2, 1)
    board.picks[0].playerId = "a"
    board.picks[1].playerId = "b"
    board.currentOverall = 3

    const players = [
      player("a", { PTS: 30, TO: 4 }),
      player("b", { PTS: 10, TO: 1 }),
    ]

    const report = buildMockCategoryRankReport(board, players, 2)

    expect(report.teams[0].ranks.PTS).toBe(1)
    expect(report.teams[1].ranks.PTS).toBe(2)
    expect(report.teams[0].ranks.TO).toBe(2)
    expect(report.teams[1].ranks.TO).toBe(1)
  })
})
