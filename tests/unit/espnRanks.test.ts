import { describe, expect, it } from "vitest"
import { espnRankFromPlayer } from "../../scripts/lib/espn-ranks.mjs"

describe("espnRankFromPlayer", () => {
  it("uses STANDARD draft rank from the projections table, not ADP", () => {
    expect(
      espnRankFromPlayer({
        fullName: "Victor Wembanyama",
        draftRanksByRankType: {
          STANDARD: { rank: 4 },
          ROTO: { rank: 2 },
        },
        ownership: { averageDraftPosition: 3.02 },
      }),
    ).toBe(4)
  })

  it("unwraps ESPN player wrappers", () => {
    expect(
      espnRankFromPlayer({
        player: {
          fullName: "Nikola Jokic",
          draftRanksByRankType: { STANDARD: { rank: 1 } },
        },
      }),
    ).toBe(1)
  })

  it("returns null when STANDARD rank is missing", () => {
    expect(
      espnRankFromPlayer({
        fullName: "Waiver Wire",
        ownership: { averageDraftPosition: 12 },
      }),
    ).toBe(null)
  })
})
