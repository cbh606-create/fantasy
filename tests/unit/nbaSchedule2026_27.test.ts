import { describe, expect, it } from "vitest"
import { nextWeekWithGames } from "@/lib/matchup/scheduleSeason"
import season from "../../data/fixtures/nba-schedule-2026-27.json"

/** Player-map abbreviations from espnSeasonMap PRO_TEAM_ABBR (UTA/GSW/BKN/NYK/NOP/SAS/WAS). */
const CANONICAL_NBA_TEAM_ABBRS = [
  "ATL",
  "BKN",
  "BOS",
  "CHA",
  "CHI",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GSW",
  "HOU",
  "IND",
  "LAC",
  "LAL",
  "MEM",
  "MIA",
  "MIL",
  "MIN",
  "NOP",
  "NYK",
  "OKC",
  "ORL",
  "PHI",
  "PHX",
  "POR",
  "SAC",
  "SAS",
  "TOR",
  "UTA",
  "WAS",
] as const

const collectTeamsFromGames = (games: typeof season.games) => {
  const teams = new Set<string>()
  for (const game of games) {
    teams.add(game.homeAbbr)
    teams.add(game.awayAbbr)
  }
  return teams
}

const gameDaysByTeam = (games: typeof season.games) => {
  const byTeam = new Map<string, Set<string>>()
  for (const game of games) {
    for (const team of [game.homeAbbr, game.awayAbbr]) {
      const dates = byTeam.get(team) ?? new Set<string>()
      dates.add(game.date)
      byTeam.set(team, dates)
    }
  }
  return byTeam
}

describe("nba-schedule-2026-27", () => {
  it("covers tip-off through late season with all 30 teams", () => {
    expect(season.season).toBe("2026-27")
    expect(season.games.length).toBeGreaterThan(1000)
    const teams = collectTeamsFromGames(season.games)
    for (const game of season.games) {
      expect(game.date >= "2026-10-20").toBe(true)
      expect(game.date <= "2027-04-11").toBe(true)
    }
    expect([...teams].sort()).toEqual([...CANONICAL_NBA_TEAM_ABBRS])
    expect(
      season.games.some(
        (g) =>
          g.date === "2026-10-20" &&
          ((g.homeAbbr === "DET" && g.awayAbbr === "BOS") ||
            (g.homeAbbr === "BOS" && g.awayAbbr === "DET")),
      ),
    ).toBe(true)
  })

  it("mid-season week has realistic per-team game-day density", () => {
    const todayIso = "2027-01-11"
    const week = nextWeekWithGames(season.games, todayIso)
    expect(week).not.toBeNull()
    expect(week!.source).toBe("season")
    expect(week!.matchup.startDate).toBe("2027-01-11")
    expect(week!.matchup.endDate).toBe("2027-01-17")

    const byTeam = gameDaysByTeam(week!.games)
    expect([...byTeam.keys()].sort()).toEqual([...CANONICAL_NBA_TEAM_ABBRS])

    // Published week 2027-01-11..17 runs 3–5 distinct game days per team; allow 1–5 for lighter weeks.
    for (const dates of byTeam.values()) {
      expect(dates.size).toBeGreaterThanOrEqual(1)
      expect(dates.size).toBeLessThanOrEqual(5)
    }
  })
})
