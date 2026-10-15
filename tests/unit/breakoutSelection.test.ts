import { describe, expect, it } from "vitest"
import { selectBreakouts, type BreakoutPlayer } from "@/lib/injuries/breakout"
import type { RateLine } from "@/lib/injuries/breakoutStats"

const rates = (pts: number, to: number): RateLine["rates"] => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 4,
  AST: 3,
  STL: 1,
  BLK: 1,
  TO: to,
  PTS: pts,
})

const line = (
  gamesPlayed: number,
  minutesPerGame: number | null,
  pts: number,
  to = 2,
): RateLine => ({
  gamesPlayed,
  minutesPerGame,
  rates: rates(pts, to),
})

const player = (overrides: Partial<BreakoutPlayer> & { id: string }): BreakoutPlayer => ({
  id: overrides.id,
  seasonGames: overrides.seasonGames ?? null,
  season: overrides.season ?? null,
  last7: overrides.last7 ?? null,
  projection: overrides.projection ?? null,
})

const select = (players: BreakoutPlayer[]) =>
  selectBreakouts({
    players,
    availablePlayerIds: players.map((item) => item.id),
    lineups: [],
    depth: { teams: [] },
    updates: [],
    crosswalk: new Map(),
    now: new Date("2026-01-15T00:00:00.000Z"),
  })

const projectionPtsFoil = (id: string, pts: number) =>
  player({
    id,
    seasonGames: 50,
    season: line(50, 24, pts),
    projection: line(70, 24, pts),
  })

describe("selectBreakouts rates", () => {
  it("accepts one higher side during games 1 through 3", () => {
    const foil = projectionPtsFoil("foil", 40)
    const pool = player({
      id: "pool",
      seasonGames: 2,
      season: line(2, 20, 10),
      projection: line(70, 24, 12),
    })
    const minutesOnly = player({
      id: "minutes",
      seasonGames: 1,
      season: line(1, 30, 10),
      projection: line(70, 24, 12),
    })
    const statsOnly = player({
      id: "stats",
      seasonGames: 2,
      season: line(2, 20, 18),
      projection: line(70, 24, 12),
    })
    const neither = player({
      id: "flat",
      seasonGames: 2,
      season: line(2, 20, 10),
      projection: line(70, 24, 12),
    })
    const both = player({
      id: "both",
      seasonGames: 3,
      season: line(3, 30, 18),
      projection: line(70, 24, 12),
    })

    const picks = select([foil, pool, minutesOnly, statsOnly, neither, both])

    expect(picks.find((pick) => pick.playerId === "minutes")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "stats")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "both")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "flat")).toBeUndefined()
  })

  it("requires both sides against the projection for games 4 through 7", () => {
    const foil = projectionPtsFoil("foil", 40)
    const both = player({
      id: "both",
      seasonGames: 5,
      season: line(5, 30, 20),
      projection: line(70, 24, 12),
    })
    const minutesOnly = player({
      id: "minutes",
      seasonGames: 5,
      season: line(5, 30, 10),
      projection: line(70, 24, 12),
    })

    const picks = select([foil, both, minutesOnly])

    expect(picks.map((pick) => pick.playerId)).toEqual(["both"])
  })

  it("uses last-7 against the season line after 8 games", () => {
    const foil = projectionPtsFoil("foil", 40)
    const breakout = player({
      id: "breakout",
      seasonGames: 10,
      season: line(10, 24, 12, 3),
      last7: line(7, 32, 12, 1),
    })
    const shortWindow = player({
      id: "short",
      seasonGames: 10,
      season: line(10, 24, 12),
      last7: line(3, 40, 30),
    })
    const oneSide = player({
      id: "minutes-only",
      seasonGames: 10,
      season: line(10, 24, 12),
      last7: line(7, 32, 12),
    })

    const picks = select([foil, breakout, shortWindow, oneSide])

    expect(picks.map((pick) => pick.playerId)).toEqual(["breakout"])
  })

  it("drops a missing projection, zero games, and an unavailable id", () => {
    const missing = player({
      id: "missing",
      seasonGames: 5,
      season: line(5, 30, 20),
      projection: null,
    })
    const zero = player({ id: "zero", seasonGames: 0 })
    const benched = player({
      id: "benched",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })

    const picks = selectBreakouts({
      players: [missing, zero, benched],
      availablePlayerIds: ["missing", "zero"],
      lineups: [],
      depth: { teams: [] },
      updates: [],
      crosswalk: new Map(),
      now: new Date("2026-01-15T00:00:00.000Z"),
    })

    expect(picks).toEqual([])
  })
})

describe("selectBreakouts lineup", () => {
  const now = new Date("2026-01-15T12:00:00.000Z")
  const depth = {
    teams: [
      {
        teamAbbr: "ATL",
        positions: [{ position: "PG" as const, playerIds: ["rw-starter", "rw-new"] }],
      },
    ],
  }
  const lineups = [
    {
      teamAbbr: "ATL",
      startsAt: "2026-01-15T00:00:00.000Z",
      starters: [{ playerId: "rw-new", position: "PG" as const }],
    },
  ]
  const crosswalk = new Map([
    ["rw-starter", "espn-starter"],
    ["rw-new", "espn-new"],
  ])

  it("selects a confirmed starter when rank 1 is healthy", () => {
    const picks = selectBreakouts({
      players: [],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["lineup"] }])
  })

  it("skips rank 1 when that player is OUT or GTD", () => {
    for (const status of ["out", "gtd"] as const) {
      const picks = selectBreakouts({
        players: [],
        availablePlayerIds: ["espn-new"],
        lineups,
        depth,
        updates: [
          {
            rotowirePlayerId: "rw-starter",
            teamAbbr: "ATL",
            status,
            at: "2026-01-15T11:00:00.000Z",
          },
        ],
        crosswalk,
        now,
      })

      expect(picks).toEqual([])
    }
  })

  it("drops an OUT candidate and keeps a GTD rates breakout", () => {
    const gtd = player({
      id: "espn-new",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })
    const picks = selectBreakouts({
      players: [gtd],
      availablePlayerIds: ["espn-new"],
      lineups: [],
      depth: { teams: [] },
      updates: [
        {
          rotowirePlayerId: "rw-new",
          teamAbbr: "ATL",
          status: "gtd",
          at: "2026-01-15T11:00:00.000Z",
        },
      ],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["rates"] }])

    const outPicks = selectBreakouts({
      players: [],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [
        {
          rotowirePlayerId: "rw-new",
          teamAbbr: "ATL",
          status: "out",
          at: "2026-01-15T11:00:00.000Z",
        },
      ],
      crosswalk,
      now,
    })

    expect(outPicks).toEqual([])
  })

  it("keeps both reasons on one row and skips an unmapped rank 1", () => {
    const both = player({
      id: "espn-new",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })
    const picks = selectBreakouts({
      players: [both],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["rates", "lineup"] }])

    const unmapped = selectBreakouts({
      players: [],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [],
      crosswalk: new Map([["rw-new", "espn-new"]]),
      now,
    })

    expect(unmapped).toEqual([])
  })

  it("drops an OUT unexpected starter who also beats the projection in minutes", () => {
    const breakout = player({
      id: "espn-new",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })
    const picks = selectBreakouts({
      players: [breakout],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [
        {
          rotowirePlayerId: "rw-new",
          teamAbbr: "ATL",
          status: "out",
          at: "2026-01-15T11:00:00.000Z",
        },
      ],
      crosswalk,
      now,
    })

    expect(picks).toEqual([])
  })

  it("keeps a GTD unexpected starter with rates and lineup reasons", () => {
    const breakout = player({
      id: "espn-new",
      seasonGames: 2,
      season: line(2, 30, 20),
      projection: line(70, 20, 10),
    })
    const picks = selectBreakouts({
      players: [breakout],
      availablePlayerIds: ["espn-new"],
      lineups,
      depth,
      updates: [
        {
          rotowirePlayerId: "rw-new",
          teamAbbr: "ATL",
          status: "gtd",
          at: "2026-01-15T11:00:00.000Z",
        },
      ],
      crosswalk,
      now,
    })

    expect(picks).toEqual([{ playerId: "espn-new", reasons: ["rates", "lineup"] }])
  })
})
