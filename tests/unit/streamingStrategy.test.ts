import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  allowsAddForTier,
  allowsEarlySwap,
  allowsMultiSpotEarlySwap,
  allowsMultiSpotOffNightUpgrade,
  allowsThinFill,
  dailyAddPaceLimit,
  dailySwapPaceLimit,
  isAddBudgetBehind,
  normalizeStreamingStrategyMode,
  addCapForSpot,
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
  it("Conservative and balanced allow thin on last 3 days or when context says add", () => {
    expect(allowsThinFill("conservative", 3, 7)).toBe(false)
    expect(allowsThinFill("conservative", 4, 7)).toBe(true)
    expect(allowsThinFill("conservative", 6, 7)).toBe(true)
    expect(allowsThinFill("balanced", 3, 7)).toBe(false)
    expect(allowsThinFill("balanced", 4, 7)).toBe(true)
    expect(
      allowsThinFill("conservative", 0, 7, { fillsEmptySlot: true }),
    ).toBe(true)
    expect(allowsThinFill("balanced", 1, 7, { noDenserFa: true })).toBe(true)
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

  it("addCapForSpot splits the weekly limit as evenly as possible", () => {
    expect([0, 1].map((spot) => addCapForSpot(7, 2, spot))).toEqual([4, 3])
    expect([0, 1, 2].map((spot) => addCapForSpot(7, 3, spot))).toEqual([
      3, 2, 2,
    ])
    expect([0, 1, 2].map((spot) => addCapForSpot(6, 3, spot))).toEqual([
      2, 2, 2,
    ])
    expect(addCapForSpot(7, 1, 0)).toBe(7)
  })

  it("Aggressive soft-cap is ceil(addLimit/spotCount)+1", () => {
    expect(softCapForSpot(7, 3, "balanced")).toBe(3)
    expect(softCapForSpot(7, 3, "aggressive")).toBe(4)
    expect(softCapForSpot(7, 3, "conservative")).toBe(3)
  })

  it("dailyAddPaceLimit spends remaining adds today instead of rationing", () => {
    expect(dailyAddPaceLimit(7, 7)).toBe(7)
    expect(dailyAddPaceLimit(5, 3)).toBe(5)
    expect(dailyAddPaceLimit(1, 4)).toBe(1)
    expect(dailyAddPaceLimit(0, 3)).toBe(0)
  })

  it("dailySwapPaceLimit does not keep leftover adds for later days", () => {
    expect(isAddBudgetBehind(5, 4)).toBe(true)
    expect(isAddBudgetBehind(5, 5)).toBe(true)
    expect(isAddBudgetBehind(4, 5)).toBe(false)
    expect(dailySwapPaceLimit(5, 4)).toBe(5)
    expect(dailySwapPaceLimit(5, 5)).toBe(5)
    expect(dailySwapPaceLimit(4, 5)).toBe(4)
  })

  it("multi-spot early swap allows a start or contested gain at the same tier", () => {
    expect(allowsMultiSpotEarlySwap("aggressive", 0, 2, 0, 7)).toBe(true)
    expect(allowsMultiSpotEarlySwap("aggressive", 0, 1, 0, 7)).toBe(true)
    expect(allowsMultiSpotEarlySwap("aggressive", 2, 3, 0, 7)).toBe(true)
    expect(
      allowsMultiSpotEarlySwap("aggressive", 1, 1, 0, 7, false, {
        increasesStarts: true,
      }),
    ).toBe(true)
    expect(
      allowsMultiSpotEarlySwap("balanced", 2, 2, 0, 7, false, {
        improvesContested: true,
      }),
    ).toBe(true)
    expect(allowsMultiSpotEarlySwap("aggressive", 1, 1, 0, 7)).toBe(false)
  })

  it("multi-spot off-night needs strong+ early week; late week allows any tier", () => {
    expect(allowsMultiSpotOffNightUpgrade("ok", 0, 7)).toBe(false)
    expect(allowsMultiSpotOffNightUpgrade("thin", 0, 7)).toBe(false)
    expect(allowsMultiSpotOffNightUpgrade("strong", 0, 7)).toBe(true)
    expect(allowsMultiSpotOffNightUpgrade("thin", 4, 7)).toBe(true)
    expect(allowsMultiSpotOffNightUpgrade("ok", 4, 7)).toBe(true)
  })
})
