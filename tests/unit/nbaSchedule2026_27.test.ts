import { describe, expect, it } from "vitest"
import season from "../../data/fixtures/nba-schedule-2026-27.json"

describe("nba-schedule-2026-27", () => {
  it("covers tip-off through late season with all 30 teams", () => {
    expect(season.season).toBe("2026-27")
    expect(season.games.length).toBeGreaterThan(1000)
    const teams = new Set<string>()
    for (const game of season.games) {
      teams.add(game.homeAbbr)
      teams.add(game.awayAbbr)
      expect(game.date >= "2026-10-20").toBe(true)
      expect(game.date <= "2027-04-11").toBe(true)
    }
    expect(teams.size).toBe(30)
    expect(
      season.games.some(
        (g) =>
          g.date === "2026-10-20" &&
          ((g.homeAbbr === "DET" && g.awayAbbr === "BOS") ||
            (g.homeAbbr === "BOS" && g.awayAbbr === "DET")),
      ),
    ).toBe(true)
  })
})
