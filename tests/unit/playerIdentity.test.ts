import { describe, expect, it } from "vitest"
import { espnHeadshotUrl, playerInitials } from "@/lib/players/playerIdentity"

describe("playerIdentity", () => {
  it("builds ESPN headshot URL", () => {
    expect(espnHeadshotUrl("5104157")).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/5104157.png",
    )
  })

  it("builds initials", () => {
    expect(playerInitials("Victor Wembanyama")).toBe("VW")
  })
})
