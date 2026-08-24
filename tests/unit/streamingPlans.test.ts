import { describe, expect, it } from "vitest"
import { WEEKLY_ADD_LIMIT } from "@/lib/matchup/constants"

describe("WEEKLY_ADD_LIMIT", () => {
  it("is 7 ESPN-style weekly acquisitions", () => {
    expect(WEEKLY_ADD_LIMIT).toBe(7)
  })
})
