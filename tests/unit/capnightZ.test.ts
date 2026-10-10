import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { capnightPlayerZ } from "@/lib/players/capnightZ"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

const player = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  projections: {
    FG_PCT: 0.5,
    FT_PCT: 0.8,
    TPM: 1,
    REB: 5,
    AST: 5,
    STL: 1,
    BLK: 1,
    TO: 2,
    PTS: 15,
  },
  shooting: { FGM: 5, FGA: 10, FTM: 4, FTA: 5 },
})

describe("capnightPlayerZ", () => {
  it("matches an accented name to the sheet and leaves everyone else at zero", () => {
    const jokic = capnightPlayerZ("Nikola Jokić")

    expect(jokic.value).toBeCloseTo(1.578332, 5)
    expect(jokic.z.PTS).toBeCloseTo(2.594638, 5)
    expect(jokic.z.TO).toBeLessThan(0)
    expect(capnightPlayerZ("Not A Real Player").value).toBe(0)
    expect(capnightPlayerZ("Not A Real Player").z.PTS).toBe(0)
  })

  it("places the roster z sum on a league scale", () => {
    const jokic = player("jokic", "Nikola Jokic")
    const missing = player("missing", "Not A Real Player")
    const state: SeasonLeagueState = {
      name: "Capnight z",
      season: 2026,
      categories: defaultCategorySettings(),
      perspectiveTeamIndex: 0,
      teams: [jokic, missing].map((rosterPlayer, teamIndex) => ({
        teamIndex,
        name: rosterPlayer.name,
        entries: [{ slot: "UTIL", playerId: rosterPlayer.id }],
      })),
      players: [jokic, missing],
      availablePlayerIds: [],
      waiverOrder: [0, 1],
      source: "manual",
    }
    const analysis = analyzeSeasonLeague(state)
    const jokicPts = analysis.byCategory
      .find((category) => category.categoryId === "PTS")
      ?.rows.find((row) => row.teamIndex === 0)

    expect(jokicPts?.z).toBeCloseTo(1, 5)
    const missingPts = analysis.byTeam[1]?.levels.find(
      (level) => level.categoryId === "PTS",
    )
    expect(missingPts?.z).toBeCloseTo(-1, 5)
    expect(missingPts?.kind).toBe("negative")
  })
})
