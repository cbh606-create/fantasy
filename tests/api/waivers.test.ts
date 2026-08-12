import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as claimWaivers } from "@/app/api/waivers/claim/route"
import { GET as getWaiversPool } from "@/app/api/waivers/pool/route"
import { POST as previewWaivers } from "@/app/api/waivers/preview/route"
import { POST as createSeasonLeague } from "@/app/api/season-leagues/route"
import { db } from "@/lib/db"
import type { SeasonLeagueState } from "@/lib/season/types"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `waivers-api-${crypto.randomUUID()}`
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
      name: "Waivers API league",
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

describe("GET /api/waivers/pool", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await getWaiversPool(
      new Request("http://localhost/api/waivers/pool?seasonLeagueId=missing"),
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

    const response = await getWaiversPool(
      new Request(
        `http://localhost/api/waivers/pool?seasonLeagueId=${league.id}`,
      ),
    )

    expect(response.status).toBe(404)
  })

  it("returns a non-empty available pool for a manual season league", async () => {
    const league = await createManualLeague()

    const response = await getWaiversPool(
      new Request(
        `http://localhost/api/waivers/pool?seasonLeagueId=${league.id}`,
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.available.length).toBeGreaterThan(0)
    expect(payload).toMatchObject({
      waiverOrder: expect.any(Array),
      youWaiverRank: expect.any(Number),
      youNeeds: expect.any(Array),
      recommendations: expect.any(Array),
      playersById: expect.any(Object),
    })
  })
})

describe("POST /api/waivers/preview", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await previewWaivers(
      createJsonRequest("/api/waivers/preview", {
        seasonLeagueId: "missing",
        addPlayerId: "fa1",
        dropPlayerId: "t3p14",
      }),
    )

    expect(response.status).toBe(401)
  })

  it("returns preview deltas for a valid add/drop", async () => {
    const league = await createManualLeague()

    const response = await previewWaivers(
      createJsonRequest("/api/waivers/preview", {
        seasonLeagueId: league.id,
        addPlayerId: "fa1",
        dropPlayerId: "t3p14",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      youWaiverRank: expect.any(Number),
      requiresAssumeSuccess: false,
      before: { needsScore: expect.any(Number) },
      after: { needsScore: expect.any(Number) },
      categoryDeltas: expect.any(Array),
    })
  })
})

describe("POST /api/waivers/claim", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await claimWaivers(
      createJsonRequest("/api/waivers/claim", {
        seasonLeagueId: "missing",
        addPlayerId: "fa1",
        dropPlayerId: "t3p14",
      }),
    )

    expect(response.status).toBe(401)
  })

  it("moves a free agent onto YOUR roster", async () => {
    const league = await createManualLeague()

    const response = await claimWaivers(
      createJsonRequest("/api/waivers/claim", {
        seasonLeagueId: league.id,
        addPlayerId: "fa1",
        dropPlayerId: "t3p14",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      youWaiverRank: expect.any(Number),
    })

    const updated = await db.seasonLeague.findFirst({
      where: { id: league.id },
    })
    const state = JSON.parse(updated!.stateJson) as SeasonLeagueState

    expect(updated!.localLineupJson).toBeNull()
    expect(state.availablePlayerIds).not.toContain("fa1")
    expect(state.availablePlayerIds).toContain("t3p14")

    const youTeam = state.teams.find(
      (team) => team.teamIndex === state.perspectiveTeamIndex,
    )!

    expect(youTeam.entries.some((entry) => entry.playerId === "fa1")).toBe(true)
    expect(youTeam.entries.some((entry) => entry.playerId === "t3p14")).toBe(
      false,
    )
  })

  it("returns 409 assume_required for waiver adds without assumeSuccess", async () => {
    const league = await createManualLeague()

    const response = await claimWaivers(
      createJsonRequest("/api/waivers/claim", {
        seasonLeagueId: league.id,
        addPlayerId: "fa13",
        dropPlayerId: "t3p14",
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "assume_required" })
  })

  it("applies a waiver add when assumeSuccess is true", async () => {
    const league = await createManualLeague()

    const response = await claimWaivers(
      createJsonRequest("/api/waivers/claim", {
        seasonLeagueId: league.id,
        addPlayerId: "fa13",
        dropPlayerId: "t3p14",
        assumeSuccess: true,
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      youWaiverRank: 3,
    })

    const updated = await db.seasonLeague.findFirst({
      where: { id: league.id },
    })
    const state = JSON.parse(updated!.stateJson) as SeasonLeagueState

    expect(state.availablePlayerIds).not.toContain("fa13")
    expect(
      state.teams
        .find((team) => team.teamIndex === state.perspectiveTeamIndex)!
        .entries.some((entry) => entry.playerId === "fa13"),
    ).toBe(true)
  })
})
