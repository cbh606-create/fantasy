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

describe("selectBreakouts rates", () => {
  it("accepts one higher side during games 1 through 3", () => {
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

    const picks = select([pool, minutesOnly, statsOnly, neither, both])

    expect(picks.find((pick) => pick.playerId === "minutes")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "stats")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "both")?.reasons).toEqual(["rates"])
    expect(picks.find((pick) => pick.playerId === "flat")).toBeUndefined()
  })

  it("requires both sides against the projection for games 4 through 7", () => {
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

    const picks = select([both, minutesOnly])

    expect(picks.map((pick) => pick.playerId)).toEqual(["both"])
  })

  it("uses last-7 against the season line after 8 games", () => {
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

    const picks = select([breakout, shortWindow, oneSide])

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
