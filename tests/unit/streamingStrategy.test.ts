import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  allowsEarlySwap,
  allowsThinFill,
  normalizeStreamingStrategyMode,
  softCapForSpot,
  suggestStreamingStrategyMode,
} from "@/lib/matchup/streamingStrategy"

const boardWithOutcomes = (losses: number, ties: number): MatchupBoard => {
  const total = ALL_CATEGORY_IDS.length
  const behind = losses + ties
  return {
    categories: ALL_CATEGORY_IDS.map((categoryId, index) => {
      let outcome: "W" | "L" | "T" = "W"
      if (index < losses) outcome = "L"
      else if (index < behind) outcome = "T"
      return {
        categoryId,
        you: 1,
        opp: 2,
        outcome,
        winProb: 0.4,
      }
    }),
    wins: total - behind,
    losses,
    ties,
    projectedCatWins: total - behind,
  }
}

describe("suggestStreamingStrategyMode", () => {
  it("suggests aggressive when behindRatio >= 0.5", () => {
    // 5 L of 9 cats → ~0.556
    expect(suggestStreamingStrategyMode(boardWithOutcomes(5, 0))).toBe(
      "aggressive",
    )
  })

  it("suggests conservative when behindRatio <= 0.25", () => {
    // 2 L of 9 → ~0.222
    expect(suggestStreamingStrategyMode(boardWithOutcomes(2, 0))).toBe(
      "conservative",
    )
  })

  it("suggests balanced otherwise", () => {
    expect(suggestStreamingStrategyMode(boardWithOutcomes(3, 0))).toBe(
      "balanced",
    )
  })

  it("suggests balanced for empty categories", () => {
    expect(
      suggestStreamingStrategyMode({
        categories: [],
        wins: 0,
        losses: 0,
        ties: 0,
        projectedCatWins: 0,
      }),
    ).toBe("balanced")
  })
})

describe("normalizeStreamingStrategyMode", () => {
  it("falls back to balanced for invalid values", () => {
    expect(normalizeStreamingStrategyMode("nope")).toBe("balanced")
    expect(normalizeStreamingStrategyMode(undefined)).toBe("balanced")
  })
})

describe("mode policy helpers", () => {
  it("Conservative never allows thin fill", () => {
    expect(allowsThinFill("conservative", 6, 7)).toBe(false)
  })

  it("Balanced allows thin only on last 2 days", () => {
    expect(allowsThinFill("balanced", 4, 7)).toBe(false)
    expect(allowsThinFill("balanced", 5, 7)).toBe(true)
    expect(allowsThinFill("balanced", 6, 7)).toBe(true)
  })

  it("Aggressive always allows thin when days remain", () => {
    expect(allowsThinFill("aggressive", 0, 7)).toBe(true)
  })

  it("early swap slack is +2 balanced / +1 aggressive", () => {
    expect(allowsEarlySwap("balanced", 0, 1)).toBe(false)
    expect(allowsEarlySwap("balanced", 0, 2)).toBe(true)
    expect(allowsEarlySwap("aggressive", 0, 1)).toBe(true)
    expect(allowsEarlySwap("conservative", 0, 3)).toBe(false)
  })

  it("Aggressive soft-cap is ceil(addLimit/spotCount)+1", () => {
    expect(softCapForSpot(7, 3, "balanced")).toBe(3)
    expect(softCapForSpot(7, 3, "aggressive")).toBe(4)
    expect(softCapForSpot(7, 3, "conservative")).toBe(3)
  })
})
