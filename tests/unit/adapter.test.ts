import { describe, expect, it } from "vitest"
import {
  loadFixtureSeason,
  loadRookiePriors,
  loadRosters,
  loadSeasonBoxes
} from "@/lib/projections/adapter"

describe("fixture adapter", () => {
  it("loads season T with a departed star and enough veteran boxes", async () => {
    const t = await loadFixtureSeason("data/fixtures/projection-season-t.json")
    expect(t.boxes.length).toBeGreaterThanOrEqual(20)
    const departed = t.rosters.flatMap((roster) => roster.departed)
    expect(departed.length).toBeGreaterThanOrEqual(1)
    const star = departed.find((player) => player.playerId === "gone")
    expect(star).toBeDefined()
    expect(star?.lastMpg).toBe(36)
    expect(star?.lastUsg).toBe(28)
  })

  it("reads 2025 and 2026 via season loaders", async () => {
    const boxes2025 = await loadSeasonBoxes(2025)
    const rosters2026 = await loadRosters(2026)
    const rookies2026 = await loadRookiePriors(2026)
    expect(boxes2025.length).toBeGreaterThanOrEqual(20)
    expect(rosters2026.some((roster) => roster.teamId === "AAA")).toBe(true)
    expect(rookies2026.some((rookie) => rookie.playerId === "pick1" && rookie.draftSlot === 1)).toBe(true)
  })
})
