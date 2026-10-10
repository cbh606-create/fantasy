import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import scheduleFixture from "../../data/fixtures/nba-matchup-schedule.json"
import { GET } from "@/app/api/schedule/route"
import { POST } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"
import type { ScheduleResponse } from "@/lib/season/types"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

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

const testUserPrefix = `schedule-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

beforeEach(() => {
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
})

afterEach(async () => {
  await db.seasonLeague.deleteMany({
    where: { clerkUserId: { startsWith: testUserPrefix } },
  })
})

const createLeague = async () => {
  const response = await POST(
    new Request("http://localhost/api/season-leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Schedule league", manual: true }),
    }),
  )

  return (await response.json()) as { id: string }
}

describe("GET /api/schedule", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await GET(
      new Request("http://localhost/api/schedule?seasonLeagueId=x"),
    )

    expect(response.status).toBe(401)
  })

  it("requires a season league ID", async () => {
    const response = await GET(
      new Request("http://localhost/api/schedule"),
    )

    expect(response.status).toBe(400)
  })

  it("returns fixture matchup for an owned season league", async () => {
    const league = await createLeague()

    const response = await GET(
      new Request(`http://localhost/api/schedule?seasonLeagueId=${league.id}`),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.source).toBe("fixture")
    expect(body.matchup.days).toHaveLength(7)
    expect(Array.isArray(body.games)).toBe(true)
  })

  it("returns 404 for another user's league", async () => {
    const league = await createLeague()
    authenticateAs(`${testUserPrefix}-other`)

    const response = await GET(
      new Request(`http://localhost/api/schedule?seasonLeagueId=${league.id}`),
    )

    expect(response.status).toBe(404)
  })
})
