import { describe, expect, it } from "vitest"
import {
  espnLinkStatusLabel,
  espnLinkStatusTone,
} from "@/lib/espn/linkStatus"

describe("espn link status", () => {
  it("labels connection states clearly", () => {
    expect(espnLinkStatusLabel("none")).toMatch(/not connected/i)
    expect(espnLinkStatusLabel("saved")).toMatch(/saved/i)
    expect(espnLinkStatusLabel("verified")).toMatch(/verified/i)
    expect(espnLinkStatusLabel("expired")).toMatch(/expired/i)
  })

  it("maps tones for UI emphasis", () => {
    expect(espnLinkStatusTone("verified")).toBe("ok")
    expect(espnLinkStatusTone("expired")).toBe("bad")
    expect(espnLinkStatusTone("none")).toBe("mute")
  })
})
