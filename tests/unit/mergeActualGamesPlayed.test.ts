import { describe, expect, it } from "vitest"
import {
  actualGamesPlayed,
  mergeActualGamesPlayed,
} from "@/lib/players/mergeActualGamesPlayed"

const projections = {
  FG_PCT: 0.57,
  FT_PCT: 0.83,
  TPM: 112,
  REB: 836,
  AST: 697,
  STL: 92,
  BLK: 53,
  TO: 243,
  PTS: 1799,
}

describe("mergeActualGamesPlayed", () => {
  it("reads games from the actual season row", () => {
    expect(actualGamesPlayed([
      { id: "102026", statSourceId: 1, stats: { "42": 70 } },
      { id: "002026", seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, stats: { "42": 62 } },
    ], 2026)).toBe(62)
  })

  it("writes projectedGames and leaves counting totals", () => {
    const [player] = mergeActualGamesPlayed(
      [{ espnId: "3112335", projections }],
      { "3112335": 62 },
    )
    expect(player.projectedGames).toBe(62)
    expect(player.projections).toEqual(projections)
  })

  it("leaves a player with no actual games untouched", () => {
    const [player] = mergeActualGamesPlayed(
      [{ espnId: "1", projections: { ...projections } }],
      {},
    )
    expect(player.projectedGames).toBeUndefined()
    expect(player.projections.PTS).toBe(1799)
  })
})
