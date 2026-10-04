import { describe, expect, it } from "vitest"
import {
  pickRecommendedYouSpot,
  shouldAutoApplyYouSpot,
  type YouSpotScore,
} from "@/lib/matchup/recommendYouSpot"

const score = (
  spot: YouSpotScore["spot"],
  gameStarts: number,
  addsUsed = 0,
): YouSpotScore => ({ spot, gameStarts, addsUsed })

describe("pickRecommendedYouSpot", () => {
  it("picks the spot with the most team starts", () => {
    expect(
      pickRecommendedYouSpot([
        score(null, 40),
        score(1, 44),
        score(2, 48),
        score(3, 46),
      ]),
    ).toBe(2)
  })

  it("breaks a start tie toward fewer adds", () => {
    expect(
      pickRecommendedYouSpot([
        score(2, 45, 6),
        score(1, 45, 3),
      ]),
    ).toBe(1)
  })

  it("breaks an equal start and add tie toward fewer spots, treating None as zero", () => {
    expect(
      pickRecommendedYouSpot([
        score(2, 45, 3),
        score(null, 45, 3),
        score(1, 45, 3),
      ]),
    ).toBeNull()
  })

  it("returns undefined when there is nothing to score", () => {
    expect(pickRecommendedYouSpot([])).toBeUndefined()
  })
})

describe("shouldAutoApplyYouSpot", () => {
  it("applies on the first scores and when the Opp assumption changes", () => {
    expect(shouldAutoApplyYouSpot(null, "auto:")).toBe(true)
    expect(shouldAutoApplyYouSpot("auto:", "auto:")).toBe(false)
    expect(shouldAutoApplyYouSpot("auto:", "2:")).toBe(true)
  })
})
