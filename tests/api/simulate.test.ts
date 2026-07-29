import { headers } from "next/headers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type {
  LeagueSettings,
  LeagueState,
  SimulationResult,
} from "@/lib/domain/types"
import {
  POST,
  runWithSimCountFallback,
} from "@/app/api/draft/simulate/route"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const settings: LeagueSettings = {
  teams: 12,
  draftType: "snake",
  rosterSlots: ["PG"],
  categories: defaultCategorySettings(),
  userPickSlot: 1,
  puntCategoryIds: [],
  focusCategoryIds: [],
  rounds: 1,
}

const state: LeagueState = {
  settings,
  board: buildEmptyBoard(settings.teams, settings.rounds),
  players: [],
  source: "manual",
  perspectiveTeamIndex: 0,
}

const createRequest = (body: unknown): Request =>
  new Request("http://localhost/api/draft/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

beforeEach(() => {
  authenticateAs(`user-${crypto.randomUUID()}`)
})

describe("POST /api/draft/simulate", () => {
  it("returns a simulation result for a valid body", async () => {
    const response = await POST(createRequest({ state, simCount: 1, seed: 9 }))
    const result = (await response.json()) as SimulationResult

    expect(response.status).toBe(200)
    expect(result.meta).toMatchObject({
      simCount: 1,
      seed: 9,
      source: "manual",
    })
  })

  it("returns field errors for an invalid body", async () => {
    const response = await POST(
      createRequest({ state, simCount: 101, seed: 9 }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: "validation",
      fields: {
        simCount: expect.any(String),
      },
    })
  })

  it("returns 401 when no user is authenticated", async () => {
    authenticateAs()

    const response = await POST(createRequest({ state }))

    expect(response.status).toBe(401)
  })

  it("limits each user to ten requests per minute", async () => {
    authenticateAs(`limited-${crypto.randomUUID()}`)

    for (let requestNumber = 0; requestNumber < 10; requestNumber++) {
      const response = await POST(
        createRequest({ state, simCount: 1, seed: requestNumber }),
      )
      expect(response.status).toBe(200)
    }

    const response = await POST(createRequest({ state, simCount: 1, seed: 10 }))

    expect(response.status).toBe(429)
  })
})

describe("runWithSimCountFallback", () => {
  it("retries a slow simulation once with half the simulation count", () => {
    const result: SimulationResult = {
      nextPicks: [],
      topCombinations: [],
      categoryOutlook: Object.fromEntries(
        defaultCategorySettings().map(({ id }) => [id, 0]),
      ) as SimulationResult["categoryOutlook"],
      meta: {
        simCount: 5,
        seed: 7,
        generatedAt: new Date(0).toISOString(),
        latencyMs: 0,
        source: "manual",
      },
    }
    const runSimulation = vi.fn(() => result)
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(8_001)

    expect(
      runWithSimCountFallback(
        { state, simCount: 10, seed: 7, forcePickPlayerId: "player-1" },
        runSimulation,
        now,
      ),
    ).toBe(result)
    expect(runSimulation).toHaveBeenNthCalledWith(1, {
      state,
      simCount: 10,
      seed: 7,
      forcePickPlayerId: "player-1",
    })
    expect(runSimulation).toHaveBeenNthCalledWith(2, {
      state,
      simCount: 5,
      seed: 7,
      forcePickPlayerId: "player-1",
    })
  })
})
