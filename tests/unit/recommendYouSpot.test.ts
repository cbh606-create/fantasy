import { describe, expect, it } from "vitest"
import {
  pickRecommendedYouSpot,
  shouldAutoApplyYouSpot,
  type YouSpotScore,
} from "@/lib/matchup/recommendYouSpot"

const score = (
  spot: YouSpotScore["spot"],
  projectedCatWins: number,
  addsUsed = 0,
  gameStarts = 0,
): YouSpotScore => ({ spot, gameStarts, addsUsed, projectedCatWins })

describe("pickRecommendedYouSpot", () => {
  it("picks the spot with the highest expected category wins", () => {
    expect(
      pickRecommendedYouSpot([
        score(null, 3.1),
        score(1, 3.4),
        score(2, 3.9),
        score(3, 3.6),
      ]),
    ).toBe(2)
  })

  it("breaks an expected-wins tie toward fewer adds", () => {
    expect(
      pickRecommendedYouSpot([
        score(2, 3.5, 6),
        score(1, 3.5, 3),
      ]),
    ).toBe(1)
  })

  it("breaks an equal expected-wins and add tie toward fewer spots, treating None as zero", () => {
    expect(
      pickRecommendedYouSpot([
        score(2, 3.5, 3),
        score(null, 3.5, 3),
        score(1, 3.5, 3),
      ]),
    ).toBeNull()
  })

  it("returns undefined when there is nothing to score", () => {
    expect(pickRecommendedYouSpot([])).toBeUndefined()
  })
})

describe("shouldAutoApplyYouSpot", () => {
  it("applies on the first scores and when the Opp assumption changes", () => {
    expect(shouldAutoApplyYouSpot(null, "0:")).toBe(true)
    expect(shouldAutoApplyYouSpot("0:", "0:")).toBe(false)
    expect(shouldAutoApplyYouSpot("0:", "2:")).toBe(true)
  })
})
