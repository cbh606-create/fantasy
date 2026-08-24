import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getInjuryPickups } from "@/app/api/injuries/pickups/route"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { db } from "@/lib/db"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `injuries-pickups-api-${crypto.randomUUID()}`
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

const createPlayer = (id: string, name: string, teamAbbr: string): SeasonPlayer => ({
  id,
  name,
  teamAbbr,
  availability: "fa",
  projections: weakProjections,
  shooting: {
    FGM: 4,
    FGA: 10,
    FTM: 6,
    FTA: 10,
  },
})

const createInjuryPickupState = (): SeasonLeagueState => {
  const trae = createPlayer("trae-young", "Trae Young", "ATL")
  const naw = createPlayer(
    "nickeil-alexander-walker",
    "Nickeil Alexander-Walker",
    "ATL",
  )
  const filler = createPlayer("you-filler", "Filler Guard", "BOS")

  return {
    name: "Injury pickups API league",
    season: 2026,
    categories: defaultCategorySettings(),
    perspectiveTeamIndex: 0,
    teams: [
      {
        teamIndex: 0,
        name: "YOU",
        entries: [{ slot: "PG", playerId: filler.id }],
      },
      {
        teamIndex: 1,
        name: "OPP",
        entries: [{ slot: "PG", playerId: trae.id }],
      },
    ],
    players: [trae, naw, filler],
    availablePlayerIds: [naw.id],
    waiverOrder: [0, 1],
    source: "manual",
  }
}

const seedInjuryPickupLeague = async () => {
  const state = createInjuryPickupState()

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
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
})

afterEach(async () => {
  await db.seasonLeague.deleteMany({
    where: {
      clerkUserId: {
        startsWith: testUserPrefix,
      },
    },
  })
})

describe("GET /api/injuries/pickups", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await getInjuryPickups(
      new Request(
        "http://localhost/api/injuries/pickups?seasonLeagueId=missing",
      ),
    )

    expect(response.status).toBe(401)
  })

  it("returns 400 without seasonLeagueId", async () => {
    const response = await getInjuryPickups(
      new Request("http://localhost/api/injuries/pickups"),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "validation" })
  })

  it("does not expose another user's season league", async () => {
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: `${testUserPrefix}-other-user`,
        name: "Other user's league",
        season: 2025,
        perspectiveTeamIndex: 0,
        source: "manual",
        stateJson: "{}",
      },
    })

    const response = await getInjuryPickups(
      new Request(
        `http://localhost/api/injuries/pickups?seasonLeagueId=${league.id}`,
      ),
    )

    expect(response.status).toBe(404)
  })

  it("returns injury pickup recommendations for a seeded league", async () => {
    const league = await seedInjuryPickupLeague()

    const response = await getInjuryPickups(
      new Request(
        `http://localhost/api/injuries/pickups?seasonLeagueId=${league.id}`,
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      events: expect.any(Array),
      recommendations: expect.any(Array),
      source: { depth: "fixture", injuries: "fixture" },
    })
    expect(payload.events.length).toBeGreaterThan(0)
    expect(payload.recommendations.length).toBeGreaterThan(0)
    expect(payload.recommendations[0]).toMatchObject({
      injuredPlayerId: "trae-young",
      addPlayerId: "nickeil-alexander-walker",
      addPlayerName: "Nickeil Alexander-Walker",
      teamAbbr: "ATL",
      status: "out",
      depthRank: 1,
      urgency: "league",
      score: expect.any(Number),
      reasons: expect.any(Array),
    })
  })
})
