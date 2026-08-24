import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import scheduleFixture from "../../data/fixtures/nba-matchup-schedule.json"
import { GET as getMatchupStream } from "@/app/api/waivers/matchup-stream/route"
import { POST as previewMatchupStreamRoute } from "@/app/api/waivers/matchup-stream/preview/route"
import { POST as createSeasonLeague } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"
import { getMatchupSchedule } from "@/lib/matchup/scheduleLive"
import type { ScheduleResponse } from "@/lib/season/types"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/matchup/scheduleLive", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/matchup/scheduleLive")>()

  return {
    ...actual,
    getMatchupSchedule: vi.fn(
      async () => scheduleFixture as ScheduleResponse,
    ),
  }
})

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
    expect(getMatchupSchedule).toHaveBeenCalled()
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

describe("POST /api/waivers/matchup-stream/preview", () => {
  it("returns live before/after board for a valid add/drop", async () => {
    const league = await createManualLeague()

    const response = await previewMatchupStreamRoute(
      createJsonRequest("/api/waivers/matchup-stream/preview", {
        seasonLeagueId: league.id,
        addPlayerId: "fa1",
        dropPlayerId: "t3p11",
        opponentTeamIndex: 1,
        dayCount: 3,
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      mode: "matchup",
      windowDays: expect.any(Array),
      before: expect.objectContaining({
        wins: expect.any(Number),
        categories: expect.any(Array),
      }),
      after: expect.objectContaining({
        wins: expect.any(Number),
        categories: expect.any(Array),
      }),
      summary: expect.any(String),
    })
    expect(payload.windowDays).toHaveLength(3)
    expect(getMatchupSchedule).toHaveBeenCalled()
  })

  it("returns 400 when add player is not available", async () => {
    const league = await createManualLeague()

    const response = await previewMatchupStreamRoute(
      createJsonRequest("/api/waivers/matchup-stream/preview", {
        seasonLeagueId: league.id,
        addPlayerId: "t1p1",
        dropPlayerId: "t3p11",
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "add_not_available" })
  })
})
