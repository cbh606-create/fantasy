import { describe, expect, it } from "vitest"
import {
  allowsEarlySwap,
  allowsMultiSpotEarlySwap,
  allowsMultiSpotOffNightUpgrade,
  allowsThinFill,
  dailyAddPaceLimit,
  dailySwapPaceLimit,
  isAddBudgetBehind,
  addCapForSpot,
  canSpotSpendAdd,
} from "@/lib/matchup/streamingStrategy"

describe("streaming add policy", () => {
  it("allows thin on last 3 days or when a hole / no denser FA exists", () => {
    expect(allowsThinFill(3, 7)).toBe(false)
    expect(allowsThinFill(4, 7)).toBe(true)
    expect(allowsThinFill(6, 7)).toBe(true)
    expect(allowsThinFill(0, 7, { fillsEmptySlot: true })).toBe(true)
    expect(allowsThinFill(1, 7, { noDenserFa: true })).toBe(true)
  })

  it("early swap needs a density jump of 2", () => {
    expect(allowsEarlySwap(0, 1)).toBe(false)
    expect(allowsEarlySwap(0, 2)).toBe(true)
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

  it("canSpotSpendAdd overflows a full spot cap to add a start", () => {
    expect(canSpotSpendAdd(4, 6, 3, 3, false)).toBe(false)
    expect(canSpotSpendAdd(4, 6, 3, 3, true)).toBe(true)
    expect(canSpotSpendAdd(6, 6, 3, 3, true)).toBe(false)
    expect(canSpotSpendAdd(2, 6, 1, 3, false)).toBe(true)
  })

  it("dailyAddPaceLimit rations leftover adds across remaining days", () => {
    expect(dailyAddPaceLimit(6, 6)).toBe(1)
    expect(dailyAddPaceLimit(7, 7)).toBe(1)
    expect(dailyAddPaceLimit(5, 3)).toBe(3)
    expect(dailyAddPaceLimit(1, 4)).toBe(1)
    expect(dailyAddPaceLimit(4, 1)).toBe(4)
    expect(dailyAddPaceLimit(0, 3)).toBe(0)
  })

  it("dailyAddPaceLimit raises the cap to empty spots when two or more are open", () => {
    expect(dailyAddPaceLimit(6, 6, 3)).toBe(3)
    expect(dailyAddPaceLimit(6, 6, 2)).toBe(2)
    expect(dailyAddPaceLimit(6, 6, 1)).toBe(1)
    expect(dailyAddPaceLimit(2, 4, 3)).toBe(2)
  })

  it("dailySwapPaceLimit keeps leftover adds for later days", () => {
    expect(isAddBudgetBehind(5, 4)).toBe(true)
    expect(isAddBudgetBehind(5, 5)).toBe(true)
    expect(isAddBudgetBehind(4, 5)).toBe(false)
    expect(dailySwapPaceLimit(5, 4)).toBe(2)
    expect(dailySwapPaceLimit(5, 5)).toBe(1)
    expect(dailySwapPaceLimit(4, 5)).toBe(1)
  })

  it("multi-spot early swap allows a start or contested gain at the same tier", () => {
    expect(allowsMultiSpotEarlySwap(0, 2, 0, 7)).toBe(true)
    expect(allowsMultiSpotEarlySwap(0, 1, 0, 7)).toBe(true)
    expect(allowsMultiSpotEarlySwap(2, 3, 0, 7)).toBe(true)
    expect(
      allowsMultiSpotEarlySwap(1, 1, 0, 7, false, { increasesStarts: true }),
    ).toBe(true)
    expect(
      allowsMultiSpotEarlySwap(2, 2, 0, 7, false, { improvesContested: true }),
    ).toBe(true)
    expect(allowsMultiSpotEarlySwap(1, 1, 0, 7)).toBe(false)
  })

  it("multi-spot off-night needs strong+ early week; late week allows any tier", () => {
    expect(allowsMultiSpotOffNightUpgrade("ok", 0, 7)).toBe(false)
    expect(allowsMultiSpotOffNightUpgrade("thin", 0, 7)).toBe(false)
    expect(allowsMultiSpotOffNightUpgrade("strong", 0, 7)).toBe(true)
    expect(allowsMultiSpotOffNightUpgrade("thin", 4, 7)).toBe(true)
    expect(allowsMultiSpotOffNightUpgrade("ok", 4, 7)).toBe(true)
  })
})
