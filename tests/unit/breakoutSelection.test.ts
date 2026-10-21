import { describe, expect, it } from "vitest"
import {
  formatBreakoutEvidence,
  formatBreakoutLast7,
  selectBreakouts,
  type BreakoutPlayer,
} from "@/lib/injuries/breakout"
import type { RateLine } from "@/lib/injuries/breakoutStats"

const rates = (pts: number, to: number): NonNullable<RateLine["rates"]> => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 4,
  AST: 3,
  STL: 0.4,
  BLK: 0.3,
  TO: to,
  PTS: pts,
})

const line = (
  gamesPlayed: number,
  minutesPerGame: number | null,
  pts: number,
  to = 2,
  fgaPerGame: number | null = null,
  rateOverrides: Partial<NonNullable<RateLine["rates"]>> = {},
): RateLine => ({
  gamesPlayed,
  minutesPerGame,
  fgaPerGame,
  rates: { ...rates(pts, to), ...rateOverrides },
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
  it("keeps an early 28-minute role without last year and still checks z after eight games", () => {
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

    expect(picks.map((pick) => pick.playerId)).toEqual(["minutes", "short-gap", "exact", "both"])

    const settledFoil = projectionPtsFoil("settled-foil", 40)
    const heldLater = player({
      id: "held-later",
      seasonGames: 10,
      season: line(10, 26, 18),
      projection: line(70, 20, 12),
    })
    const fadedLater = player({
      id: "faded-later",
      seasonGames: 10,
      season: line(10, 30, 8),
      projection: line(70, 20, 20),
    })
    const modestLater = player({
      id: "modest-later",
      seasonGames: 10,
      season: line(10, 26, 18),
      projection: line(70, 24, 12),
    })

    expect(select([settledFoil, heldLater, fadedLater, modestLater]).map((pick) => pick.playerId)).toEqual([
      "held-later",
    ])
  })

  it("passes a team change when minutes rise by three", () => {
    const moved = player({
      id: "moved",
      teamAbbr: "ATL",
      seasonGames: 8,
      season: line(8, 23, 8),
      prior: { teamAbbr: "NOP", line: line(70, 20, 14) },
    })
    const shortOfThree = player({
      id: "short-of-three",
      teamAbbr: "ATL",
      seasonGames: 8,
      season: line(8, 22, 8),
      prior: { teamAbbr: "NOP", line: line(70, 20, 14) },
    })
    const smallBump = player({
      id: "small-bump",
      teamAbbr: "PHI",
      seasonGames: 1,
      season: line(1, 25, 8),
      prior: { teamAbbr: "BOS", line: line(70, 24.9, 14) },
    })
    const sameTeam = player({
      id: "same",
      teamAbbr: "PHX",
      seasonGames: 8,
      season: line(8, 25, 8),
      prior: { teamAbbr: "PHO", line: line(70, 20, 14) },
    })
    const fewerMinutes = player({
      id: "fewer",
      teamAbbr: "ATL",
      seasonGames: 8,
      season: line(8, 18, 20),
      prior: { teamAbbr: "NOP", line: line(70, 20, 10) },
    })

    const picks = select([moved, shortOfThree, smallBump, sameTeam, fewerMinutes])

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

  it("catches an early same-team minutes jump before the z-sum is stable", () => {
    const foil = player({
      id: "foil",
      teamAbbr: "BOS",
      seasonGames: 3,
      season: line(3, 24, 20),
      prior: { teamAbbr: "BOS", line: line(70, 24, 10) },
    })
    const hart = player({
      id: "hart",
      teamAbbr: "NYK",
      seasonGames: 3,
      season: line(3, 36, 8),
      prior: { teamAbbr: "NYK", line: line(70, 28, 30) },
    })
    const short = player({
      id: "short",
      teamAbbr: "CHI",
      seasonGames: 3,
      season: line(3, 34, 18),
      prior: { teamAbbr: "CHI", line: line(70, 28, 12) },
    })
    const settled = player({
      id: "settled",
      teamAbbr: "DAL",
      seasonGames: 8,
      season: line(8, 36, 8),
      prior: { teamAbbr: "DAL", line: line(70, 28, 30) },
    })

    const early = select([foil, hart])
    expect(early.map((pick) => pick.playerId)).toEqual(["hart"])
    expect(early[0]?.reasons).toEqual(["rates"])
    expect(early[0]?.evidence).toMatchObject({
      games: 3,
      baseline: "prior",
      baselineMinutes: 28,
      seasonMinutes: 36,
      zHeld: false,
      attempts: null,
    })
    expect(formatBreakoutEvidence(early[0].evidence)).toBe(
      "28.0 → 36.0 mpg · 3 GP · z down · FGA n/a",
    )
    expect(select([foil, short])).toEqual([])
    expect(select([foil, settled])).toEqual([])
  })

  it("formats the last seven games as the breakout record", () => {
    expect(
      formatBreakoutLast7({
        games: 3,
        minutesPerGame: 32.4,
        rates: {
          FG_PCT: 0.48,
          FT_PCT: 0.8,
          TPM: 2.1,
          REB: 4.2,
          AST: 3.5,
          STL: 1.1,
          BLK: 0.4,
          TO: 1.6,
          PTS: 18.2,
        },
      }),
    ).toBe("18.2 PTS · 4.2 REB · 3.5 AST · 2.1 3PM")
    expect(formatBreakoutLast7(null)).toBe("No last 7 games")
  })

  it("catches a one-game team change when minutes rise and attempts do not", () => {
    const foil = player({
      id: "foil",
      teamAbbr: "BOS",
      seasonGames: 1,
      season: line(1, 24, 20),
      prior: { teamAbbr: "BOS", line: line(70, 24, 10) },
    })
    const daniels = player({
      id: "daniels",
      teamAbbr: "ATL",
      seasonGames: 1,
      season: line(1, 35, 8, 2, 8),
      prior: { teamAbbr: "NOP", line: line(70, 22, 14, 2, 9) },
    })

    const picks = select([foil, daniels])

    expect(picks.map((pick) => pick.playerId)).toEqual(["daniels"])
    expect(picks[0]?.reasons).toEqual(["rates"])
    expect(picks[0]?.evidence).toMatchObject({
      games: 1,
      baseline: "prior",
      baselineMinutes: 22,
      seasonMinutes: 35,
      zHeld: false,
      attempts: "down",
    })
    expect(formatBreakoutEvidence(picks[0].evidence)).toBe(
      "22.0 → 35.0 mpg · 1 GP · z down · FGA down",
    )
  })

  it("keeps a same-team shot vacancy when attempts jump and minutes stay under eight", () => {
    const powell = player({
      id: "powell",
      teamAbbr: "LAC",
      seasonGames: 4,
      season: line(4, 32, 8, 2, 16),
      prior: { teamAbbr: "LAC", line: line(70, 26, 20, 2, 11) },
    })
    const smallAttemptJump = player({
      id: "small",
      teamAbbr: "LAC",
      seasonGames: 4,
      season: line(4, 32, 20, 2, 14),
      prior: { teamAbbr: "LAC", line: line(70, 26, 12, 2, 11) },
    })

    const foil = player({
      id: "foil",
      teamAbbr: "BOS",
      seasonGames: 40,
      season: line(40, 24, 10, 2, 8),
      prior: { teamAbbr: "BOS", line: line(70, 24, 10, 2, 8) },
    })
    const cooled = player({
      id: "cooled",
      teamAbbr: "DAL",
      seasonGames: 10,
      season: line(10, 32, 8, 2, 16),
      prior: { teamAbbr: "DAL", line: line(70, 26, 30, 2, 11) },
    })

    expect(select([powell]).map((pick) => pick.playerId)).toEqual(["powell"])
    expect(select([smallAttemptJump])).toEqual([])
    expect(select([foil, cooled])).toEqual([])
  })

  it("keeps a 20-to-28 minute specialist without a minute jump", () => {
    const kessler = player({
      id: "kessler",
      seasonGames: 6,
      season: line(6, 23, 9, 2, 6, { BLK: 2.3, STL: 0.4 }),
      projection: line(70, 22, 8),
    })
    const shortSample = player({
      id: "two-games",
      seasonGames: 2,
      season: line(2, 23, 9, 2, 6, { BLK: 2.3, STL: 0.4 }),
      projection: line(70, 22, 8),
    })

    const fadedMinutes = player({
      id: "faded-minutes",
      seasonGames: 12,
      season: line(12, 23, 9, 2, 6, { BLK: 2.3, STL: 0.4 }),
      last7: line(7, 18, 7, 2, 5, { BLK: 2.3, STL: 0.4 }),
      projection: line(70, 22, 8),
    })

    expect(select([kessler]).map((pick) => pick.playerId)).toEqual(["kessler"])
    expect(select([shortSample])).toEqual([])
    expect(select([fadedMinutes])).toEqual([])
  })

  it("uses the last seven games when the season average has not caught up", () => {
    const hartenstein = player({
      id: "hartenstein",
      teamAbbr: "NYK",
      seasonGames: 24,
      season: line(24, 20, 6),
      last7: line(7, 30, 10),
      prior: { teamAbbr: "NYK", line: line(70, 19, 5) },
    })

    const bona = player({
      id: "bona",
      seasonGames: 20,
      season: line(20, 16, 6),
      last7: line(7, 29, 12),
    })

    expect(select([hartenstein]).map((pick) => pick.playerId)).toEqual(["hartenstein"])
    expect(select([bona]).map((pick) => pick.playerId)).toEqual(["bona"])
  })

  it("drops a scorer whose recent points fell while the minutes stayed", () => {
    const jaquez = player({
      id: "jaquez",
      seasonGames: 12,
      season: line(12, 32, 16),
      last7: line(7, 28, 10),
      projection: line(70, 20, 10),
    })
    const specialist = player({
      id: "specialist",
      seasonGames: 12,
      season: line(12, 24, 10, 2, null, { REB: 8.3, STL: 1.2, BLK: 1.1 }),
      last7: line(7, 25, 5, 2, null, { REB: 8, STL: 1.2, BLK: 1.1 }),
      projection: line(70, 18, 8),
    })

    expect(select([jaquez])).toEqual([])
    expect(select([specialist]).map((pick) => pick.playerId)).toEqual(["specialist"])
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
      season: line(5, 22, 20),
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

    expect(picks).toMatchObject([{ playerId: "espn-new", reasons: ["lineup"] }])
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

    expect(picks).toMatchObject([{ playerId: "espn-new", reasons: ["rates"] }])

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

    expect(picks).toMatchObject([{ playerId: "espn-new", reasons: ["rates", "lineup"] }])

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

    expect(picks).toMatchObject([{ playerId: "espn-new", reasons: ["rates", "lineup"] }])
  })
})
