import { describe, expect, it } from "vitest"
import { filterDraftEligible } from "@/lib/players/draftEligible"
import type { Player } from "@/lib/domain/types"

const base = (over: Partial<Player> & Pick<Player, "id" | "name" | "adp">): Player => ({
  positions: ["PG"],
  projections: {
    FG_PCT: 0, FT_PCT: 0, TPM: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, PTS: 0,
  },
  ...over,
})

describe("filterDraftEligible", () => {
  it("drops players missing primary adpBySource", () => {
    const players = [
      base({
        id: "1",
        name: "Keep",
        adp: 10,
        adpBySource: { yahoo_draft_analysis_rank: 10 },
      }),
      base({ id: "2", name: "Chris Paul", adp: 137 }),
    ]
    const next = filterDraftEligible(players, {
      primary: "yahoo_draft_analysis_rank",
      teams: 12,
      rounds: 13,
    })
    expect(next.map((p) => p.name)).toEqual(["Keep"])
  })

  it("drops players deeper than teams*rounds*1.5", () => {
    const depth = 12 * 13 * 1.5 // 234
    const players = [
      base({
        id: "1",
        name: "In",
        adp: 200,
        adpBySource: { yahoo_draft_analysis_rank: 200 },
      }),
      base({
        id: "2",
        name: "Out",
        adp: depth + 1,
        adpBySource: { yahoo_draft_analysis_rank: depth + 1 },
      }),
    ]
    const next = filterDraftEligible(players, {
      primary: "yahoo_draft_analysis_rank",
      teams: 12,
      rounds: 13,
    })
    expect(next.map((p) => p.name)).toEqual(["In"])
  })
})
