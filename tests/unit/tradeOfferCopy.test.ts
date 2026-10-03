import { describe, expect, it } from "vitest"
import { formatTotal, formatValueLine } from "@/lib/trade/offerCopy"

describe("offer copy", () => {
  it("formats percentages and counting totals", () => {
    expect(formatTotal("FG_PCT", 0.456)).toBe("45.6%")
    expect(formatTotal("AST", 12.34)).toBe("12.3")
  })

  it("names the larger even package and the overpay multiple", () => {
    expect(formatValueLine({ giveLarger: true, valueGap: 0.084 })).toBe(
      "Your package is larger by 8%",
    )
    expect(formatValueLine({ giveLarger: false, valueGap: 0.084 })).toBe(
      "Their package is larger by 8%",
    )
    expect(formatValueLine({ giveLarger: true, valueGap: 0.004 })).toBe(
      "Packages are even",
    )
    expect(formatValueLine({ giveLarger: true, overpayRatio: 1.236 })).toBe(
      "The two-player side is 1.24× the one-player side",
    )
  })
})
