import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  allowsAddForTier,
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

  it("suggests conservative when behindRatio <= 0.15", () => {
    // 1 L of 9 → ~0.111
    expect(suggestStreamingStrategyMode(boardWithOutcomes(1, 0))).toBe(
      "conservative",
    )
  })

  it("suggests balanced otherwise", () => {
    // 2 L of 9 → ~0.222 (was conservative at 0.25 threshold)
    expect(suggestStreamingStrategyMode(boardWithOutcomes(2, 0))).toBe(
      "balanced",
    )
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
  it("Conservative and balanced allow thin only on last 3 days", () => {
    expect(allowsThinFill("conservative", 3, 7)).toBe(false)
    expect(allowsThinFill("conservative", 4, 7)).toBe(true)
    expect(allowsThinFill("conservative", 6, 7)).toBe(true)
    expect(allowsThinFill("balanced", 3, 7)).toBe(false)
    expect(allowsThinFill("balanced", 4, 7)).toBe(true)
    expect(allowsThinFill("balanced", 6, 7)).toBe(true)
  })

  it("Aggressive always allows thin when days remain", () => {
    expect(allowsThinFill("aggressive", 0, 7)).toBe(true)
  })

  it("conservative allows elite, strong, and ok tiers only", () => {
    expect(allowsAddForTier("conservative", "elite")).toBe(true)
    expect(allowsAddForTier("conservative", "strong")).toBe(true)
    expect(allowsAddForTier("conservative", "ok")).toBe(true)
    expect(allowsAddForTier("conservative", "thin")).toBe(false)
  })

  it("balanced and aggressive allow all tiers (thin gated by allowsThinFill)", () => {
    for (const mode of ["balanced", "aggressive"] as const) {
      expect(allowsAddForTier(mode, "elite")).toBe(true)
      expect(allowsAddForTier(mode, "strong")).toBe(true)
      expect(allowsAddForTier(mode, "ok")).toBe(true)
      expect(allowsAddForTier(mode, "thin")).toBe(true)
    }
  })

  it("early swap slack is +2 balanced/conservative / +1 aggressive", () => {
    expect(allowsEarlySwap("balanced", 0, 1)).toBe(false)
    expect(allowsEarlySwap("balanced", 0, 2)).toBe(true)
    expect(allowsEarlySwap("conservative", 0, 1)).toBe(false)
    expect(allowsEarlySwap("conservative", 0, 2)).toBe(true)
    expect(allowsEarlySwap("aggressive", 0, 1)).toBe(true)
  })

  it("Aggressive soft-cap is ceil(addLimit/spotCount)+1", () => {
    expect(softCapForSpot(7, 3, "balanced")).toBe(3)
    expect(softCapForSpot(7, 3, "aggressive")).toBe(4)
    expect(softCapForSpot(7, 3, "conservative")).toBe(3)
  })
})
