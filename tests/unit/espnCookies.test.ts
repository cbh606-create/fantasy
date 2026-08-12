import { describe, expect, it } from "vitest"
import { normalizeEspnCookies, normalizeSwid } from "@/lib/espn/cookies"

describe("normalizeSwid", () => {
  it("adds braces when missing", () => {
    expect(normalizeSwid("abc-def")).toBe("{abc-def}")
    expect(normalizeSwid("{abc-def}")).toBe("{abc-def}")
  })
})

describe("normalizeEspnCookies", () => {
  it("returns null for blank values", () => {
    expect(normalizeEspnCookies({ espnS2: "", swid: "x" })).toBeNull()
    expect(normalizeEspnCookies({ espnS2: "s2", swid: "" })).toBeNull()
  })

  it("returns trimmed cookie pair", () => {
    expect(
      normalizeEspnCookies({ espnS2: "  s2value  ", swid: " uuid " }),
    ).toEqual({
      espnS2: "s2value",
      swid: "{uuid}",
    })
  })
})
