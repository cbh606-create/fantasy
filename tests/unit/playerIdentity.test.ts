import { describe, expect, it } from "vitest"
import {
  espnHeadshotUrl,
  playerInitials,
  resolvePlayerImageUrl,
} from "@/lib/players/playerIdentity"

describe("playerIdentity", () => {
  it("builds ESPN headshot URL", () => {
    expect(espnHeadshotUrl("5104157")).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/5104157.png",
    )
  })

  it("builds initials", () => {
    expect(playerInitials("Victor Wembanyama")).toBe("VW")
  })

  it("resolves a headshot from espnId, numeric id, or espn- prefix", () => {
    expect(resolvePlayerImageUrl({ espnId: "5104157" })).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/5104157.png",
    )
    expect(resolvePlayerImageUrl({ id: "3975" })).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/3975.png",
    )
    expect(resolvePlayerImageUrl({ id: "espn-4065648" })).toBe(
      "https://a.espncdn.com/i/headshots/nba/players/full/4065648.png",
    )
    expect(resolvePlayerImageUrl({ id: "you-1" })).toBeUndefined()
  })
})
