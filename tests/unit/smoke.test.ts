import { describe, expect, it } from "vitest"

describe("scaffold", () => {
  it("resolves the @ alias", async () => {
    const { ALL_CATEGORY_IDS } = await import("@/lib/domain/categories")
    expect(ALL_CATEGORY_IDS).toHaveLength(9)
  })
})
