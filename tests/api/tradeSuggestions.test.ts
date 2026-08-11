import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/trade/suggestions/route"
import { POST as createSeasonLeague } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `trade-suggestions-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const createRequest = (seasonLeagueId: string): Request =>
  new Request(
    `http://localhost/api/trade/suggestions?seasonLeagueId=${seasonLeagueId}`,
  )

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

describe("GET /api/trade/suggestions", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await GET(createRequest("missing"))

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

    const response = await GET(createRequest(league.id))

    expect(response.status).toBe(404)
  })

  it("returns computed suggestions for a manual season league", async () => {
    const createResponse = await createSeasonLeague(
      new Request("http://localhost/api/season-leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Trade suggestions league",
          manual: true,
        }),
      }),
    )
    const league = await createResponse.json()

    const response = await GET(createRequest(league.id))
    const payload = await response.json()

    expect(createResponse.status).toBe(201)
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      suggestions: expect.any(Array),
      youNeeds: expect.any(Array),
      youSurplus: expect.any(Array),
      analysisPerspectiveTeamIndex: league.perspectiveTeamIndex,
    })
  })
})
