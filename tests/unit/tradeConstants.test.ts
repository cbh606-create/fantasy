import { describe, expect, it } from "vitest"
import {
  FAIRNESS_BAND,
  NEED_RANK_FLOOR,
  OVERPAY_RATIO,
  SURPLUS_RANK_CEILING,
  TRADE_PAGE_SIZE,
} from "@/lib/trade/constants"

describe("trade constants", () => {
  it("pins MVP thresholds from the spec", () => {
    expect(NEED_RANK_FLOOR).toBe(9)
    expect(SURPLUS_RANK_CEILING).toBe(4)
    expect(FAIRNESS_BAND).toBe(0.25)
    expect(OVERPAY_RATIO).toBe(1.2)
    expect(TRADE_PAGE_SIZE).toBe(20)
  })
})
