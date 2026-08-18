import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getMatchupStream } from "@/app/api/waivers/matchup-stream/route"
import { POST as createSeasonLeague } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `waivers-matchup-stream-${crypto.randomUUID()}`
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
      name: "Matchup stream API league",
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

describe("GET /api/waivers/matchup-stream", () => {
  it("returns 401 when unauthorized", async () => {
    authenticateAs()

    const response = await getMatchupStream(
      new Request(
        "http://localhost/api/waivers/matchup-stream?seasonLeagueId=missing",
      ),
    )

    expect(response.status).toBe(401)
  })

  it("returns 400 without seasonLeagueId", async () => {
    const response = await getMatchupStream(
      new Request("http://localhost/api/waivers/matchup-stream"),
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

    const response = await getMatchupStream(
      new Request(
        `http://localhost/api/waivers/matchup-stream?seasonLeagueId=${league.id}`,
      ),
    )

    expect(response.status).toBe(404)
  })

  it("returns pairs payload for owned league", async () => {
    const league = await createManualLeague()

    const response = await getMatchupStream(
      new Request(
        `http://localhost/api/waivers/matchup-stream?seasonLeagueId=${league.id}&opponentTeamIndex=1&dayCount=3`,
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      mode: expect.stringMatching(/matchup|volume/),
      windowDays: expect.any(Array),
      pairs: expect.any(Array),
      topAdds: expect.any(Array),
      topDrops: expect.any(Array),
    })
    expect(payload.windowDays).toHaveLength(3)
  })

  it("ignores invalid dayCount and uses the full week", async () => {
    const league = await createManualLeague()

    const response = await getMatchupStream(
      new Request(
        `http://localhost/api/waivers/matchup-stream?seasonLeagueId=${league.id}&dayCount=99`,
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.windowDays).toHaveLength(7)
  })
})
