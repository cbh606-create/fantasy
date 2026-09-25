import { describe, expect, it } from "vitest"
import {
  formatNextPickFrequency,
  formatNextPickShares,
} from "@/lib/sim/formatNextPickFrequency"

const percentSum = (labels: string[]) =>
  labels.reduce((total, label) => total + Number(label.replace("%", "")), 0)

describe("formatNextPickFrequency", () => {
  it("prefixes a rounded percent with tilde", () => {
    expect(formatNextPickFrequency(0.5)).toBe("~50%")
    expect(formatNextPickFrequency(1)).toBe("~100%")
    expect(formatNextPickFrequency(0.333)).toBe("~33%")
  })
})

describe("formatNextPickShares", () => {
  it("formats first-pick shares so displayed percents sum to 100", () => {
    expect(formatNextPickShares([0.5, 0.3, 0.2])).toEqual(["50%", "30%", "20%"])
    expect(percentSum(formatNextPickShares([1 / 3, 1 / 3, 1 / 3]))).toBe(100)
  })

  it("keeps never-picked rows at 0% and still sums to 100", () => {
    expect(formatNextPickShares([1, 0, 0])).toEqual(["100%", "0%", "0%"])
  })

  it("returns blank labels when no sims have counted yet", () => {
    expect(formatNextPickShares([0, 0, 0])).toEqual(["", "", ""])
  })
})
