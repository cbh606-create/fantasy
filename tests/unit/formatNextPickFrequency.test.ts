import { describe, expect, it } from "vitest"
import { formatNextPickFrequency } from "@/lib/sim/formatNextPickFrequency"

describe("formatNextPickFrequency", () => {
  it("prefixes a rounded percent with tilde", () => {
    expect(formatNextPickFrequency(0.5)).toBe("~50%")
    expect(formatNextPickFrequency(1)).toBe("~100%")
    expect(formatNextPickFrequency(0.333)).toBe("~33%")
  })
})
