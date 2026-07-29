import { describe, expect, it } from "vitest"
import { defaultCategorySettings, effectiveWeights } from "@/lib/domain/categories"

describe("defaultCategorySettings", () => {
  it("returns 9 enabled cats with weight 1", () => {
    const cats = defaultCategorySettings()
    expect(cats).toHaveLength(9)
    expect(cats.every((c) => c.enabled && c.weight === 1)).toBe(true)
  })
})

describe("effectiveWeights", () => {
  it("zeroes punt cats and boosts focus cats", () => {
    const cats = defaultCategorySettings()
    const w = effectiveWeights(cats, ["TO"], ["STL", "BLK"])
    expect(w.TO).toBe(0)
    expect(w.STL).toBe(1.5)
    expect(w.PTS).toBe(1)
  })

  it("disabled cats get weight 0", () => {
    const cats = defaultCategorySettings().map((c) =>
      c.id === "FG_PCT" ? { ...c, enabled: false } : c,
    )
    const w = effectiveWeights(cats, [], [])
    expect(w.FG_PCT).toBe(0)
  })
})
