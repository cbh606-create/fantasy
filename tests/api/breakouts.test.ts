import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getBreakouts } from "@/app/api/injuries/breakouts/route"
import { loadEspnBreakoutPlayers } from "@/lib/injuries/espnStatCache"
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { db } from "@/lib/db"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import type { BreakoutPlayer } from "@/lib/injuries/breakout"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/injuries/espnStatCache", () => ({
  loadEspnBreakoutPlayers: vi.fn(),
}))

vi.mock("@/lib/injuries/rotowireCache", () => ({
  loadInjurySelectionInputs: vi.fn(),
}))

const rates = (pts: number) => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 3,
  AST: 2,
  STL: 1,
  BLK: 0.5,
  TO: 2,
  PTS: pts,
})

const line = (games: number, minutes: number, pts: number) => ({
  gamesPlayed: games,
  minutesPerGame: minutes,
  rates: rates(pts),
})

const breakoutPlayer = (
  id: string,
  seasonGames: number,
): BreakoutPlayer => ({
  id,
  seasonGames,
  season: seasonGames > 0 ? line(seasonGames, 30, 12) : null,
  last7: null,
  projection: line(70, 20, 12),
})

const emptyInjury = {
  updates: [],
  depth: { teams: [] },
  lineups: [],
  crosswalk: new Map<string, string>(),
}

const testUserPrefix = `breakouts-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const weakProjections: Record<CategoryId, number> = {
  FG_PCT: 0.4,
  FT_PCT: 0.6,
  TPM: 0,
  REB: 2,
  AST: 1,
  STL: 1,
  BLK: 0,
  TO: 6,
  PTS: 8,
}

const createPlayer = (id: string, name: string): SeasonPlayer => ({
  id,
  name,
  teamAbbr: "ATL",
  availability: "fa",
  projections: weakProjections,
  shooting: { FGM: 4, FGA: 10, FTM: 6, FTA: 10 },
})

const seedLeague = async () => {
  const state: SeasonLeagueState = {
    name: "Breakouts API league",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: [
      {
        teamIndex: 0,
        name: "YOU",
        entries: [{ slot: "PG", playerId: "you-filler" }],
      },
    ],
    players: [
      createPlayer("you-filler", "Filler"),
      createPlayer("rates-guy", "Rates Guy"),
      createPlayer("lineup-guy", "Lineup Guy"),
      createPlayer("out-guy", "Out Guy"),
    ],
    availablePlayerIds: ["rates-guy", "lineup-guy", "out-guy"],
    waiverOrder: [0],
    source: "manual",
  }

  return db.seasonLeague.create({
    data: {
      clerkUserId: currentUserId,
      name: state.name,
      season: state.season,
      perspectiveTeamIndex: state.perspectiveTeamIndex,
      source: "manual",
      stateJson: JSON.stringify(state),
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"))
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
})

afterEach(async () => {
  vi.useRealTimers()
  await db.seasonLeague.deleteMany({
    where: { clerkUserId: { startsWith: testUserPrefix } },
  })
})

describe("GET /api/injuries/breakouts", () => {
  it("returns rates and lineup rows and omits an OUT player", async () => {
    vi.mocked(loadEspnBreakoutPlayers).mockResolvedValue({
      source: "espn",
      players: [
        breakoutPlayer("rates-guy", 2),
        breakoutPlayer("lineup-guy", 0),
        breakoutPlayer("out-guy", 0),
      ],
    })
    vi.mocked(loadInjurySelectionInputs).mockResolvedValue({
      updates: [
        {
          rotowirePlayerId: "rw-out",
          teamAbbr: "ATL",
          status: "out",
          at: "2026-10-15T11:00:00.000Z",
        },
      ],
      depth: {
        teams: [
          {
            teamAbbr: "ATL",
            positions: [
              { position: "PG", playerIds: ["rw-starter", "rw-lineup"] },
              { position: "SG", playerIds: ["rw-starter", "rw-out"] },
            ],
          },
        ],
      },
      lineups: [
        {
          teamAbbr: "ATL",
          startsAt: "2026-10-15T00:00:00.000Z",
          starters: [
            { playerId: "rw-lineup", position: "PG" },
            { playerId: "rw-out", position: "SG" },
          ],
        },
      ],
      crosswalk: new Map([
        ["rw-starter", "chart-starter"],
        ["rw-lineup", "lineup-guy"],
        ["rw-out", "out-guy"],
      ]),
    })

    const league = await seedLeague()
    const response = await getBreakouts(
      new Request(`http://localhost/api/injuries/breakouts?seasonLeagueId=${league.id}`),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      source: "espn",
      recommendations: [
        { playerId: "rates-guy", reasons: ["rates"] },
        { playerId: "lineup-guy", reasons: ["lineup"] },
      ],
    })
  })

  it("returns an empty list when no ESPN snapshot exists", async () => {
    vi.mocked(loadEspnBreakoutPlayers).mockResolvedValue({
      source: "empty",
      players: [],
    })
    vi.mocked(loadInjurySelectionInputs).mockResolvedValue(emptyInjury)
    const league = await seedLeague()
    const response = await getBreakouts(
      new Request(`http://localhost/api/injuries/breakouts?seasonLeagueId=${league.id}`),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      recommendations: [],
      source: "empty",
    })
  })
})
