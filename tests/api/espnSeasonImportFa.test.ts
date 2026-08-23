import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as importEspnSeason } from "@/app/api/espn/season-import/route"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { espnImportToSeasonLeagueState } from "@/lib/adapters/espnSeason"
import { upsertUserEspnCredentials } from "@/lib/espn/credentials"
import { db } from "@/lib/db"
import fixture from "../../data/fixtures/espn-season-league.json"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/adapters/espnSeason", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/adapters/espnSeason")>()

  return {
    ...actual,
    espnImportToSeasonLeagueState: vi.fn(
      actual.espnImportToSeasonLeagueState,
    ),
  }
})

const testUserPrefix = `espn-season-import-fa-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const createRequest = (body: unknown): Request =>
  new Request("http://localhost/api/espn/season-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(async () => {
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
  await upsertUserEspnCredentials(currentUserId, {
    espnS2: "test-s2",
    swid: "{TEST-SWID}",
  })
})

afterEach(async () => {
  await db.seasonLeague.deleteMany({
    where: {
      clerkUserId: {
        startsWith: testUserPrefix,
      },
    },
  })
  await db.espnCredential.deleteMany({
    where: {
      clerkUserId: {
        startsWith: testUserPrefix,
      },
    },
  })
})

describe("POST /api/espn/season-import free agents", () => {
  it("persists availablePlayerIds from live adapter state", async () => {
    const baseState = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const liveState = {
      ...baseState,
      id: "120853513",
      source: "espn" as const,
      espnTeamId: 9,
      availablePlayerIds: ["9001"],
    }

    vi.mocked(espnImportToSeasonLeagueState).mockResolvedValueOnce(liveState)

    const response = await importEspnSeason(
      createRequest({
        name: "Live FA import",
        leagueId: "120853513",
        season: 2026,
        teamId: 9,
      }),
    )
    const league = await response.json()
    const state = JSON.parse(league.stateJson)

    expect(response.status).toBe(201)
    expect(state.availablePlayerIds).toEqual(["9001"])
    expect(espnImportToSeasonLeagueState).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: "120853513",
        season: 2026,
        teamId: 9,
        cookies: { espnS2: "test-s2", swid: "{TEST-SWID}" },
      }),
    )
  })
})
