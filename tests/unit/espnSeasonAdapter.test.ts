import { describe, expect, it } from "vitest"
import fixture from "../../data/fixtures/espn-season-league.json"
import {
  detectLineupConflict,
  espnImportToSeasonLeagueState,
} from "@/lib/adapters/espnSeason"

describe("espnImportToSeasonLeagueState", () => {
  it("loads the season fixture as an ESPN league state", async () => {
    const state = await espnImportToSeasonLeagueState({
      leagueId: "fixture-league",
      season: fixture.season,
    })

    expect(state).toMatchObject({
      name: fixture.name,
      season: fixture.season,
      perspectiveTeamIndex: fixture.perspectiveTeamIndex,
      source: "espn",
    })
    expect(state.teams).toHaveLength(12)
    expect(state.teams.every((team) => team.entries.length === 14)).toBe(true)
    expect(state.players).toHaveLength(12 * 14 + 24)
  })

  it("throws the requested ESPN adapter failure", async () => {
    await expect(
      espnImportToSeasonLeagueState({
        leagueId: "fixture-league",
        season: fixture.season,
        forceFail: "ESPN_TIMEOUT",
      }),
    ).rejects.toMatchObject({ code: "ESPN_TIMEOUT" })
  })

  it("throws ESPN_NO_CREDENTIALS when forbidFixture and no live cookies", async () => {
    const previousEspnLive = process.env.ESPN_LIVE
    delete process.env.ESPN_LIVE

    try {
      await expect(
        espnImportToSeasonLeagueState({
          leagueId: "fixture-league",
          season: fixture.season,
          teamId: 1,
          forbidFixture: true,
        }),
      ).rejects.toMatchObject({ code: "ESPN_NO_CREDENTIALS" })
    } finally {
      if (previousEspnLive === undefined) {
        delete process.env.ESPN_LIVE
      } else {
        process.env.ESPN_LIVE = previousEspnLive
      }
    }
  })
})

describe("detectLineupConflict", () => {
  const snapshotEntries = [
    { slot: "PG" as const, playerId: "player-1" },
    { slot: "SG" as const, playerId: "player-2" },
  ]

  it("returns false for matching slot assignments regardless of entry order", () => {
    expect(
      detectLineupConflict(snapshotEntries, [
        { slot: "SG", playerId: "player-2" },
        { slot: "PG", playerId: "player-1" },
      ]),
    ).toBe(false)
  })

  it("returns true when a local slot assignment differs", () => {
    expect(
      detectLineupConflict(snapshotEntries, [
        { slot: "PG", playerId: "player-2" },
        { slot: "SG", playerId: "player-1" },
      ]),
    ).toBe(true)
  })
})
