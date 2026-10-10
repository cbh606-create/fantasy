import { describe, expect, it } from "vitest"
import {
  categoryStatLead,
  formatCategoryStatDelta,
} from "@/lib/season/formatCategoryStat"

describe("categoryStatLead", () => {
  it("is you minus opp, except TO where fewer is the lead", () => {
    expect(categoryStatLead("PTS", 120, 110)).toBe(10)
    expect(categoryStatLead("TO", 8, 10)).toBe(2)
    expect(categoryStatLead("TO", 12, 10)).toBe(-2)
    expect(categoryStatLead("FG_PCT", 0.48, 0.47)).toBeCloseTo(0.01)
  })
})

describe("formatCategoryStatDelta", () => {
  it("signs counting and rate gaps", () => {
    expect(formatCategoryStatDelta("PTS", 10)).toBe("+10.0")
    expect(formatCategoryStatDelta("REB", -4)).toBe("-4.0")
    expect(formatCategoryStatDelta("STL", 0)).toBe("0.0")
    expect(formatCategoryStatDelta("FG_PCT", 0.01)).toBe("+1.00%")
    expect(formatCategoryStatDelta("FT_PCT", -0.02)).toBe("-2.00%")
  })
})
