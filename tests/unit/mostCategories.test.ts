import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import { mostCategoriesSeedPuntIds } from "@/lib/matchup/mostCategories"
import type { MatchupBoard } from "@/lib/matchup/types"

const row = (categoryId: CategoryId, winProb: number) => ({
  categoryId,
  you: 1,
  opp: 1,
  outcome: "L" as const,
  winProb,
})

const board = (winProbById: [CategoryId, number][]): MatchupBoard => ({
  wins: 5,
  losses: 4,
  ties: 0,
  projectedCatWins: 4.2,
  categories: winProbById.map(([categoryId, winProb]) => row(categoryId, winProb)),
})

describe("mostCategoriesSeedPuntIds", () => {
  it("includes only categories strictly below 0.38", () => {
    expect(
      mostCategoriesSeedPuntIds(
        board([
          ["STL", 0.37],
          ["REB", 0.38],
          ["PTS", 0.5],
        ]),
      ),
    ).toEqual(["STL"])
  })
})
