import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST, GET as GET_LIST } from "@/app/api/leagues/route"
import {
  GET as GET_LEAGUE,
  PATCH,
} from "@/app/api/leagues/[id]/route"
import { manualToLeagueState } from "@/lib/adapters/manual"
import { db } from "@/lib/db"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type { LeagueState } from "@/lib/domain/types"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `leagues-api-${crypto.randomUUID()}`
let currentUserId: string

const state: LeagueState = {
  settings: {
    teams: 12,
    draftType: "snake",
    rosterSlots: ["PG"],
    categories: defaultCategorySettings(),
    userPickSlot: 1,
    puntCategoryIds: [],
    focusCategoryIds: [],
    rounds: 1,
  },
  board: buildEmptyBoard(12, 1),
  players: [],
  source: "manual",
  perspectiveTeamIndex: 0,
}

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const createRequest = (
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Request =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const routeContext = (id: string) => ({
  params: Promise.resolve({ id }),
})

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

describe("POST /api/leagues", () => {
  it("creates a league from a manual input and stores JSON strings", async () => {
    const manualInput = {
      userPickSlot: 1,
      rounds: 1,
      players: [],
    }
    const expectedState = manualToLeagueState(manualInput)
    const response = await POST(
      createRequest("http://localhost/api/leagues", "POST", {
        name: "Manual league",
        manualInput,
      }),
    )
    const league = await response.json()
    const storedLeague = await db.league.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(201)
    expect(storedLeague).toMatchObject({
      clerkUserId: currentUserId,
      name: "Manual league",
      settingsJson: JSON.stringify(expectedState.settings),
      stateJson: JSON.stringify(expectedState),
    })
  })

  it("creates a league from an imported state", async () => {
    const importedState: LeagueState = {
      ...state,
      source: "espn",
    }

    const response = await POST(
      createRequest("http://localhost/api/leagues", "POST", {
        name: "Imported league",
        state: importedState,
      }),
    )
    const league = await response.json()

    expect(response.status).toBe(201)
    expect(JSON.parse(league.stateJson)).toEqual(importedState)
    expect(JSON.parse(league.settingsJson)).toEqual(importedState.settings)
  })
})

describe("GET /api/leagues", () => {
  it("lists only the authenticated user's leagues", async () => {
    await db.league.createMany({
      data: [
        {
          clerkUserId: currentUserId,
          name: "Owned league",
          settingsJson: JSON.stringify(state.settings),
          stateJson: JSON.stringify(state),
        },
        {
          clerkUserId: `${testUserPrefix}-other`,
          name: "Other league",
          settingsJson: JSON.stringify(state.settings),
          stateJson: JSON.stringify(state),
        },
      ],
    })

    const response = await GET_LIST()
    const leagues = await response.json()

    expect(response.status).toBe(200)
    expect(leagues).toHaveLength(1)
    expect(leagues[0].name).toBe("Owned league")
  })
})

describe("GET /api/leagues/:id", () => {
  it("returns an owned league", async () => {
    const league = await db.league.create({
      data: {
        clerkUserId: currentUserId,
        name: "Owned league",
        settingsJson: JSON.stringify(state.settings),
        stateJson: JSON.stringify(state),
      },
    })

    const response = await GET_LEAGUE(
      new Request(`http://localhost/api/leagues/${league.id}`),
      routeContext(league.id),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: league.id })
  })

  it("returns 404 for another user's league", async () => {
    const league = await db.league.create({
      data: {
        clerkUserId: `${testUserPrefix}-other`,
        name: "Other league",
        settingsJson: JSON.stringify(state.settings),
        stateJson: JSON.stringify(state),
      },
    })

    const response = await GET_LEAGUE(
      new Request(`http://localhost/api/leagues/${league.id}`),
      routeContext(league.id),
    )

    expect(response.status).toBe(404)
  })
})

describe("PATCH /api/leagues/:id", () => {
  it("replaces an owned league's state and settings", async () => {
    const league = await db.league.create({
      data: {
        clerkUserId: currentUserId,
        name: "Owned league",
        settingsJson: JSON.stringify(state.settings),
        stateJson: JSON.stringify(state),
      },
    })
    const updatedState: LeagueState = {
      ...state,
      settings: {
        ...state.settings,
        userPickSlot: 2,
      },
      perspectiveTeamIndex: 1,
    }

    const response = await PATCH(
      createRequest(
        `http://localhost/api/leagues/${league.id}`,
        "PATCH",
        { state: updatedState },
      ),
      routeContext(league.id),
    )
    const updatedLeague = await response.json()

    expect(response.status).toBe(200)
    expect(JSON.parse(updatedLeague.stateJson)).toEqual(updatedState)
    expect(JSON.parse(updatedLeague.settingsJson)).toEqual(
      updatedState.settings,
    )
  })

  it("returns 404 instead of updating another user's league", async () => {
    const league = await db.league.create({
      data: {
        clerkUserId: `${testUserPrefix}-other`,
        name: "Other league",
        settingsJson: JSON.stringify(state.settings),
        stateJson: JSON.stringify(state),
      },
    })

    const response = await PATCH(
      createRequest(
        `http://localhost/api/leagues/${league.id}`,
        "PATCH",
        { state },
      ),
      routeContext(league.id),
    )

    expect(response.status).toBe(404)
  })
})
