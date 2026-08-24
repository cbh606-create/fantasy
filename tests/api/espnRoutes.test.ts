import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as importEspn } from "@/app/api/espn/import/route"
import { POST as syncEspnBoard } from "@/app/api/espn/sync-board/route"
import { espnImportToLeagueState } from "@/lib/adapters/espn"
import { db } from "@/lib/db"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `espn-api-${crypto.randomUUID()}`
const espnParams = {
  leagueId: "fixture-league",
  season: 2026,
}

let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const createRequest = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const createStoredLeague = async () => {
  const state = await espnImportToLeagueState(espnParams)
  state.source = "manual"
  state.board.picks[0].playerId = "p02"

  return db.league.create({
    data: {
      clerkUserId: currentUserId,
      name: "Existing league",
      settingsJson: JSON.stringify(state.settings),
      stateJson: JSON.stringify(state),
    },
  })
}

beforeEach(() => {
  currentUserId = `${testUserPrefix}-${crypto.randomUUID()}`
  authenticateAs(currentUserId)
})

afterEach(async () => {
  await db.league.deleteMany({
    where: {
      clerkUserId: {
        startsWith: testUserPrefix,
      },
    },
  })
})

describe("POST /api/espn/import", () => {
  it("creates a league with an ESPN state", async () => {
    const response = await importEspn(
      createRequest("/api/espn/import", {
        ...espnParams,
        name: "Imported league",
      }),
    )
    const league = await response.json()
    const state = JSON.parse(league.stateJson)

    expect(response.status).toBe(201)
    expect(league.name).toBe("Imported league")
    expect(league.espnLeagueId).toBe(espnParams.leagueId)
    expect(league.season).toBe(espnParams.season)
    expect(state.source).toBe("espn")
    expect(state.board.currentOverall).toBe(3)
  })

  it("updates an owned league when an id is supplied", async () => {
    const existingLeague = await createStoredLeague()

    const response = await importEspn(
      createRequest("/api/espn/import", {
        ...espnParams,
        id: existingLeague.id,
        name: "Re-imported league",
      }),
    )
    const league = await response.json()

    expect(response.status).toBe(200)
    expect(league.name).toBe("Re-imported league")
    expect(league.espnLeagueId).toBe(espnParams.leagueId)
    expect(league.season).toBe(espnParams.season)
    expect(JSON.parse(league.stateJson).source).toBe("espn")
  })

  it("returns a typed 502 without creating a league on adapter failure", async () => {
    const countBefore = await db.league.count({
      where: { clerkUserId: currentUserId },
    })

    const response = await importEspn(
      createRequest("/api/espn/import", {
        ...espnParams,
        forceFail: "ESPN_TIMEOUT",
      }),
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      errorCode: "ESPN_TIMEOUT",
      message: "ESPN adapter failed: ESPN_TIMEOUT",
    })
    expect(
      await db.league.count({ where: { clerkUserId: currentUserId } }),
    ).toBe(countBefore)
  })

  it("requires authentication", async () => {
    authenticateAs()

    const response = await importEspn(
      createRequest("/api/espn/import", espnParams),
    )

    expect(response.status).toBe(401)
  })

  it("limits each user to five imports per minute", async () => {
    authenticateAs(`${testUserPrefix}-limited-import-${crypto.randomUUID()}`)

    for (let requestNumber = 0; requestNumber < 5; requestNumber++) {
      const response = await importEspn(
        createRequest("/api/espn/import", {
          ...espnParams,
          name: `Import ${requestNumber}`,
        }),
      )
      expect(response.status).toBe(201)
    }

    const response = await importEspn(
      createRequest("/api/espn/import", espnParams),
    )

    expect(response.status).toBe(429)
  })
})

describe("POST /api/espn/sync-board", () => {
  it("syncs an owned league and returns conflicts", async () => {
    const existingLeague = await createStoredLeague()

    const response = await syncEspnBoard(
      createRequest("/api/espn/sync-board", {
        ...espnParams,
        id: existingLeague.id,
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.conflicts).toEqual([1])
    expect(JSON.parse(result.league.stateJson).source).toBe("mixed")
  })

  it("returns a typed 502 without changing stored state on adapter failure", async () => {
    const existingLeague = await createStoredLeague()

    const response = await syncEspnBoard(
      createRequest("/api/espn/sync-board", {
        ...espnParams,
        id: existingLeague.id,
        forceFail: "ESPN_UNAVAILABLE",
      }),
    )
    const unchangedLeague = await db.league.findUnique({
      where: { id: existingLeague.id },
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      errorCode: "ESPN_UNAVAILABLE",
      message: "ESPN adapter failed: ESPN_UNAVAILABLE",
    })
    expect(unchangedLeague?.stateJson).toBe(existingLeague.stateJson)
  })

  it("requires authentication", async () => {
    authenticateAs()

    const response = await syncEspnBoard(
      createRequest("/api/espn/sync-board", espnParams),
    )

    expect(response.status).toBe(401)
  })

  it("limits each user to five syncs per minute", async () => {
    const existingLeague = await createStoredLeague()
    authenticateAs(currentUserId)

    for (let requestNumber = 0; requestNumber < 5; requestNumber++) {
      const response = await syncEspnBoard(
        createRequest("/api/espn/sync-board", {
          ...espnParams,
          id: existingLeague.id,
        }),
      )
      expect(response.status).toBe(200)
    }

    const response = await syncEspnBoard(
      createRequest("/api/espn/sync-board", {
        ...espnParams,
        id: existingLeague.id,
      }),
    )

    expect(response.status).toBe(429)
  })
})
