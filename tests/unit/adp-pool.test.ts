import { describe, expect, it } from "vitest"
import {
  applySourceRanks,
  projectPrimary,
} from "../../scripts/lib/adp-pool.mjs"

describe("adp-pool applySourceRanks + projectPrimary", () => {
  it("merges source ranks and projects primary adp sorted", () => {
    const pool = {
      meta: {},
      players: [
        { id: "2", name: "Player B", adp: 10 },
        { id: "1", name: "Player A", adp: 20 },
      ],
    }

    const { pool: ranked, matched, unmatched } = applySourceRanks(
      pool,
      "fantasypros_yahoo",
      [
        { name: "Player A", adp: 3 },
        { name: "Player B", adp: 7 },
      ],
    )

    expect(matched).toBe(2)
    expect(unmatched).toBe(0)
    expect(ranked.players[0].adpBySource.fantasypros_yahoo).toBe(7)
    expect(ranked.players[1].adpBySource.fantasypros_yahoo).toBe(3)

    const projected = projectPrimary(ranked, "fantasypros_yahoo")
    expect(projected.players.map((player: { id: string }) => player.id)).toEqual([
      "1",
      "2",
    ])
    expect(projected.players[0].adp).toBe(3)
    expect(projected.meta.adpPrimaryDefault).toBe("fantasypros_yahoo")
  })
})
