import { describe, expect, it } from "vitest"
import type { CategoryId } from "@/lib/domain/types"
import {
  mostCategoriesHeadline,
  mostCategoriesSeedPuntIds,
} from "@/lib/matchup/mostCategories"
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

describe("mostCategoriesHeadline", () => {
  it("turns a category lead into one week win", () => {
    expect(mostCategoriesHeadline(5, 4)).toBe("1–0")
  })

  it("turns a category deficit into one week loss", () => {
    expect(mostCategoriesHeadline(4, 5)).toBe("0–1")
  })

  it("treats an equal category record as a tie", () => {
    expect(mostCategoriesHeadline(4, 4)).toBe("0–0–1")
    expect(mostCategoriesHeadline(3, 3)).toBe("0–0–1")
  })
})

describe("mostCategoriesSeedPuntIds", () => {
  it("includes only categories strictly below 0.28", () => {
    expect(
      mostCategoriesSeedPuntIds(
        board([
          ["STL", 0.27],
          ["REB", 0.28],
          ["PTS", 0.5],
        ]),
      ),
    ).toEqual(["STL"])
  })
})
