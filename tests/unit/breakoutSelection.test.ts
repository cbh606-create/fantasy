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
  fgaPerGame: number | null = null,
): RateLine => ({
  gamesPlayed,
  minutesPerGame,
  fgaPerGame,
  rates: rates(pts, to),
})

const player = (overrides: Partial<BreakoutPlayer> & { id: string }): BreakoutPlayer => ({
  id: overrides.id,
  seasonGames: overrides.seasonGames ?? null,
  season: overrides.season ?? null,
  last7: overrides.last7 ?? null,
  projection: overrides.projection ?? null,
  teamAbbr: overrides.teamAbbr ?? null,
  prior: overrides.prior ?? null,
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
  it("requires a five-minute projection gap and a z-sum that did not fall", () => {
    const foil = projectionPtsFoil("foil", 40)
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
    const shortGap = player({
      id: "short-gap",
      seasonGames: 4,
      season: line(4, 28, 18),
      projection: line(70, 24, 12),
    })
    const exact = player({
      id: "exact",
      seasonGames: 4,
      season: line(4, 29, 18),
      projection: line(70, 24, 12),
    })
    const both = player({
      id: "both",
      seasonGames: 5,
      season: line(5, 30, 18),
      projection: line(70, 24, 12),
    })

    const picks = select([foil, minutesOnly, statsOnly, shortGap, exact, both])

    expect(picks.map((pick) => pick.playerId)).toEqual(["exact", "both"])
  })

  it("passes a team change when minutes are higher than last year", () => {
    const moved = player({
      id: "moved",
      teamAbbr: "ATL",
      seasonGames: 8,
      season: line(8, 22, 8),
      prior: { teamAbbr: "NOP", line: line(70, 20, 14) },
    })
    const sameTeam = player({
      id: "same",
      teamAbbr: "PHX",
      seasonGames: 8,
      season: line(8, 22, 8),
      prior: { teamAbbr: "PHO", line: line(70, 20, 14) },
    })
    const fewerMinutes = player({
      id: "fewer",
      teamAbbr: "ATL",
      seasonGames: 8,
      season: line(8, 18, 20),
      prior: { teamAbbr: "NOP", line: line(70, 20, 10) },
    })

    const picks = select([moved, sameTeam, fewerMinutes])

    expect(picks.map((pick) => pick.playerId)).toEqual(["moved"])
  })

  it("requires an eight-minute jump and a z-sum that did not fall on the same team", () => {
    const foil = player({
      id: "foil",
      teamAbbr: "BOS",
      seasonGames: 40,
      season: line(40, 24, 10),
      prior: { teamAbbr: "BOS", line: line(70, 24, 10) },
    })
    const held = player({
      id: "held",
      teamAbbr: "ATL",
      seasonGames: 12,
      season: line(12, 32, 18),
      prior: { teamAbbr: "ATL", line: line(70, 22, 12) },
    })
    const shortGap = player({
      id: "short-gap",
      teamAbbr: "CHI",
      seasonGames: 12,
      season: line(12, 29, 18),
      prior: { teamAbbr: "CHI", line: line(70, 22, 12) },
    })
    const worse = player({
      id: "worse",
      teamAbbr: "DAL",
      seasonGames: 12,
      season: line(12, 34, 8),
      prior: { teamAbbr: "DAL", line: line(70, 22, 30) },
    })
    const projectionOnly = player({
      id: "projection-only",
      teamAbbr: "MIA",
      seasonGames: 12,
      season: line(12, 30, 20),
      projection: line(70, 18, 10),
      prior: { teamAbbr: "MIA", line: line(70, 26, 12) },
    })

    const picks = select([foil, held, shortGap, worse, projectionOnly])

    expect(picks.map((pick) => pick.playerId)).toEqual(["held"])
  })

  it("tags a scoring breakout when attempts rise and still keeps a defensive jump", () => {
    const foil = projectionPtsFoil("foil", 40)
    const scoring = player({
      id: "scoring",
      seasonGames: 6,
      season: line(6, 30, 18, 2, 16),
      projection: line(70, 22, 12, 2, 10),
    })
    const defense = player({
      id: "defense",
      seasonGames: 6,
      season: line(6, 30, 18, 2, 8),
      projection: line(70, 22, 12, 2, 10),
    })

    const picks = select([foil, scoring, defense])

    expect(picks.find((pick) => pick.playerId === "scoring")?.reasons).toEqual([
      "rates",
      "attempts",
    ])
    expect(picks.find((pick) => pick.playerId === "defense")?.reasons).toEqual(["rates"])
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
