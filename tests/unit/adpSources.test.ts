import { describe, expect, it } from "vitest"
import {
  DEFAULT_ADP_SOURCE,
  SELECTABLE_ADP_SOURCE_IDS,
  formatAdpReferenceLine,
  normalizeSelectableAdpSource,
  projectAdpFromSource,
  withProjectedAdp,
} from "@/lib/players/adpSources"
import type { Player } from "@/lib/domain/types"

const base = (over: Partial<Player> & Pick<Player, "id" | "name">): Player => ({
  positions: ["PG"],
  projections: {
    FG_PCT: 0,
    FT_PCT: 0,
    TPM: 0,
    REB: 0,
    AST: 0,
    STL: 0,
    BLK: 0,
    TO: 0,
    PTS: 0,
  },
  adp: 99,
  ...over,
})

describe("adpSources", () => {
  it("projects primary from adpBySource with fallback to adp", () => {
    const player = base({
      id: "1",
      name: "A",
      adp: 50,
      adpBySource: {
        yahoo_draft_analysis_rank: 3,
        fantasypros_yahoo: 4.2,
      },
    })
    expect(projectAdpFromSource(player, "yahoo_draft_analysis_rank")).toBe(3)
    expect(projectAdpFromSource(player, "espn_article_h2h_points")).toBe(50)
  })

  it("withProjectedAdp sorts by projected adp ascending", () => {
    const players = [
      base({
        id: "b",
        name: "B",
        adp: 1,
        adpBySource: { espn_article_h2h_points: 20 },
      }),
      base({
        id: "a",
        name: "A",
        adp: 2,
        adpBySource: { espn_article_h2h_points: 5 },
      }),
    ]
    const next = withProjectedAdp(players, "espn_article_h2h_points")
    expect(next.map((p) => p.id)).toEqual(["a", "b"])
    expect(next[0].adp).toBe(5)
    expect(DEFAULT_ADP_SOURCE).toBe("yahoo_draft_analysis_rank")
  })

  it("exposes only Yahoo ADP and ESPN ADP as selectable sources", () => {
    expect([...SELECTABLE_ADP_SOURCE_IDS]).toEqual([
      "yahoo_draft_analysis_rank",
      "espn_article_h2h_points",
    ])
    expect(normalizeSelectableAdpSource("fantasypros_yahoo")).toBe(
      "yahoo_draft_analysis_rank",
    )
  })

  it("formatAdpReferenceLine shows primary and selectable sources only", () => {
    const player = base({
      id: "1",
      name: "A",
      adp: 3,
      adpBySource: {
        yahoo_draft_analysis_rank: 3,
        fantasypros_yahoo: 4.2,
        espn_article_h2h_points: 10,
      },
    })
    expect(formatAdpReferenceLine(player, "yahoo_draft_analysis_rank")).toBe(
      "ADP 3 · ESPN 10",
    )
    expect(formatAdpReferenceLine(player, "espn_article_h2h_points")).toBe(
      "ADP 3 · Yahoo 3",
    )
  })
})
