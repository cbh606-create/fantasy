import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as applyMatchupLineup } from "@/app/api/matchup/apply-lineup/route"
import { GET as getMatchup } from "@/app/api/matchup/route"
import { POST as createSeasonLeague } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"
import type { SeasonRosterEntry } from "@/lib/season/types"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `matchup-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const createJsonRequest = (
  path: string,
  body: unknown,
  method = "POST",
): Request =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const createManualLeague = async () => {
  const response = await createSeasonLeague(
    createJsonRequest("/api/season-leagues", {
      name: "Matchup API league",
      manual: true,
    }),
  )
  const league = await response.json()

  expect(response.status).toBe(201)

  return league as { id: string; perspectiveTeamIndex: number }
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

describe("GET /api/matchup", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await getMatchup(
      new Request(
        "http://localhost/api/matchup?seasonLeagueId=missing&opponentTeamIndex=0",
      ),
    )

    expect(response.status).toBe(401)
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

    const response = await getMatchup(
      new Request(
        `http://localhost/api/matchup?seasonLeagueId=${league.id}&opponentTeamIndex=1`,
      ),
    )

    expect(response.status).toBe(404)
  })

  it("returns 400 when opponent is your own team", async () => {
    const league = await createManualLeague()

    const response = await getMatchup(
      new Request(
        `http://localhost/api/matchup?seasonLeagueId=${league.id}&opponentTeamIndex=${league.perspectiveTeamIndex}`,
      ),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_opponent" })
  })

  it("returns advice with board and sitStart for a valid opponent", async () => {
    const league = await createManualLeague()
    const opponentTeamIndex =
      league.perspectiveTeamIndex === 0 ? 1 : 0

    const response = await getMatchup(
      new Request(
        `http://localhost/api/matchup?seasonLeagueId=${league.id}&opponentTeamIndex=${opponentTeamIndex}`,
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.board.categories).toHaveLength(9)
    expect(Array.isArray(payload.sitStart)).toBe(true)
    expect(payload).toMatchObject({
      opponentTeamIndex,
      board: expect.objectContaining({
        categories: expect.any(Array),
        wins: expect.any(Number),
        losses: expect.any(Number),
      }),
      streamers: expect.any(Array),
      playersById: expect.any(Object),
      teams: expect.any(Array),
      schedule: expect.objectContaining({
        matchup: expect.objectContaining({
          days: expect.any(Array),
        }),
      }),
    })
    expect(Array.isArray(payload.schedule.matchup.days)).toBe(true)
    expect(payload.schedule.matchup.days.length).toBeGreaterThan(0)
    expect(payload.teams.some((team: { teamIndex: number }) => team.teamIndex === opponentTeamIndex)).toBe(
      true,
    )
    expect(payload.state).toBeUndefined()
  })

  it("resolves auto opponent and includes state when requested", async () => {
    const league = await createManualLeague()
    const expectedOpponent =
      league.perspectiveTeamIndex === 0 ? 1 : 0

    const response = await getMatchup(
      new Request(
        `http://localhost/api/matchup?seasonLeagueId=${league.id}&opponentTeamIndex=auto&includeState=1`,
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.opponentTeamIndex).toBe(expectedOpponent)
    expect(payload.state).toMatchObject({
      name: expect.any(String),
      perspectiveTeamIndex: league.perspectiveTeamIndex,
      teams: expect.any(Array),
    })
  })
})

describe("POST /api/matchup/apply-lineup", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await applyMatchupLineup(
      createJsonRequest("/api/matchup/apply-lineup", {
        seasonLeagueId: "missing",
        benchPlayerId: "t3p11",
        activePlayerId: "t3p1",
      }),
    )

    expect(response.status).toBe(401)
  })

  it("moves a bench player onto an active slot in localLineupJson", async () => {
    const league = await createManualLeague()

    const response = await applyMatchupLineup(
      createJsonRequest("/api/matchup/apply-lineup", {
        seasonLeagueId: league.id,
        benchPlayerId: "t3p11",
        activePlayerId: "t3p1",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      entries: expect.any(Array),
    })

    const updated = await db.seasonLeague.findFirst({
      where: { id: league.id },
    })
    const entries = JSON.parse(
      updated!.localLineupJson!,
    ) as SeasonRosterEntry[]

    expect(entries.find((entry) => entry.slot === "PG")?.playerId).toBe("t3p11")
    expect(entries.find((entry) => entry.slot === "BE")?.playerId).toBe("t3p1")
  })

  it("returns 409 stale_lineup when swap ids do not match current lineup", async () => {
    const league = await createManualLeague()

    const response = await applyMatchupLineup(
      createJsonRequest("/api/matchup/apply-lineup", {
        seasonLeagueId: league.id,
        benchPlayerId: "bogus-bench",
        activePlayerId: "bogus-active",
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "stale_lineup" })
  })
})
