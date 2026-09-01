import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-winner-stream-sample.json"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { mapEspnWinnerStreamPayload } from "@/lib/espn/winnerStreamHistory"
import type { SeasonPlayer } from "@/lib/season/types"

const stlGuard: SeasonPlayer = {
  id: "501",
  name: "Steal Guard",
  positions: ["PG"],
  projections: {
    FG_PCT: 0.45,
    FT_PCT: 0.8,
    TPM: 10,
    REB: 10,
    AST: 10,
    STL: 200,
    BLK: 10,
    TO: 10,
    PTS: 80,
  },
  shooting: { FGM: 0, FGA: 0, FTM: 0, FTA: 0 },
}

describe("mapEspnWinnerStreamPayload", () => {
  it("builds STL recipes from winners and ignores losers, trades, and the current week", () => {
    const recipes = mapEspnWinnerStreamPayload(
      fixture,
      [stlGuard],
      ALL_CATEGORY_IDS,
    )

    expect(recipes).toContainEqual(
      expect.objectContaining({
        situationCat: "STL",
        addKind: "STL",
        addGroup: "G",
        count: 2,
      }),
    )
    expect(recipes).toHaveLength(1)
  })

  it("returns no recipes for empty or unusable payloads", () => {
    expect(
      mapEspnWinnerStreamPayload({}, [stlGuard], ALL_CATEGORY_IDS),
    ).toEqual([])
  })
})
