import { describe, expect, it } from "vitest"
import {
  formatPlayerPositions,
  slotDisplayLabel,
} from "@/lib/season/slotLabels"

describe("slotLabels", () => {
  it("shows IR for IL and passes through other slots", () => {
    expect(slotDisplayLabel("IL")).toBe("IR")
    expect(slotDisplayLabel("PG")).toBe("PG")
    expect(slotDisplayLabel("BE")).toBe("BE")
  })

  it("formats player positions or an em dash when missing", () => {
    expect(formatPlayerPositions({ positions: ["PG", "SG"] })).toBe("PG/SG")
    expect(formatPlayerPositions({ positions: [] })).toBe("—")
    expect(formatPlayerPositions(undefined)).toBe("—")
  })
})
