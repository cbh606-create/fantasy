import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as importEspnSeason } from "@/app/api/espn/season-import/route"
import {
  GET as GET_LIST,
  POST,
} from "@/app/api/season-leagues/route"
import {
  DELETE as DELETE_SEASON_LEAGUE,
  GET as GET_SEASON_LEAGUE,
} from "@/app/api/season-leagues/[id]/route"
import { PATCH as updateSeasonLeagueLineup } from "@/app/api/season-leagues/[id]/lineup/route"
import { POST as refreshSeasonLeague } from "@/app/api/season-leagues/[id]/refresh/route"
import { POST as resolveSeasonLeagueConflict } from "@/app/api/season-leagues/[id]/resolve-conflict/route"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { espnImportToSeasonLeagueState } from "@/lib/adapters/espnSeason"
import { db } from "@/lib/db"
import type { SeasonLeagueState } from "@/lib/season/types"
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

const testUserPrefix = `season-leagues-api-${crypto.randomUUID()}`
let currentUserId: string

const authenticateAs = (userId?: string) => {
  vi.mocked(headers).mockResolvedValue(
    new Headers(userId ? { "x-test-user-id": userId } : {}) as never,
  )
}

const createRequest = (
  path: string,
  body: unknown,
  method = "POST",
): Request =>
  new Request(`http://localhost${path}`, {
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
  await db.seasonLeague.deleteMany({
    where: {
      clerkUserId: {
        startsWith: testUserPrefix,
      },
    },
  })
})

describe("GET /api/season-leagues", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await GET_LIST()

    expect(response.status).toBe(401)
  })
})

describe("DELETE /api/season-leagues/[id]", () => {
  it("requires authentication", async () => {
    authenticateAs()

    const response = await DELETE_SEASON_LEAGUE(
      new Request("http://localhost/api/season-leagues/x", { method: "DELETE" }),
      routeContext("x"),
    )

    expect(response.status).toBe(401)
  })

  it("returns 404 for another users league", async () => {
    const createResponse = await POST(
      createRequest("/api/season-leagues", {
        name: "Owner league",
        manual: true,
      }),
    )
    const league = await createResponse.json()

    authenticateAs(`${testUserPrefix}-other-${crypto.randomUUID()}`)

    const response = await DELETE_SEASON_LEAGUE(
      new Request(`http://localhost/api/season-leagues/${league.id}`, {
        method: "DELETE",
      }),
      routeContext(league.id),
    )

    expect(response.status).toBe(404)
    expect(
      await db.seasonLeague.findUnique({ where: { id: league.id } }),
    ).not.toBeNull()
  })

  it("deletes the owners league", async () => {
    const createResponse = await POST(
      createRequest("/api/season-leagues", {
        name: "Delete me",
        manual: true,
      }),
    )
    const league = await createResponse.json()

    const response = await DELETE_SEASON_LEAGUE(
      new Request(`http://localhost/api/season-leagues/${league.id}`, {
        method: "DELETE",
      }),
      routeContext(league.id),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(
      await db.seasonLeague.findUnique({ where: { id: league.id } }),
    ).toBeNull()
  })
})

describe("POST /api/season-leagues", () => {
  it("creates a manual season league from the fixture", async () => {
    const response = await POST(
      createRequest("/api/season-leagues", {
        name: "Manual season league",
        manual: true,
      }),
    )
    const league = await response.json()
    const storedLeague = await db.seasonLeague.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(201)
    expect(storedLeague).toMatchObject({
      clerkUserId: currentUserId,
      name: "Manual season league",
      season: fixture.season,
      perspectiveTeamIndex: fixture.perspectiveTeamIndex,
      source: "manual",
      stateJson: JSON.stringify(
        manualToSeasonLeagueState({
          ...(fixture as ManualSeasonLeagueInput),
          name: "Manual season league",
        }),
      ),
    })
  })
})

describe("GET /api/season-leagues/:id", () => {
  it("returns an owned league's effective state and analysis", async () => {
    const state: SeasonLeagueState = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const localLineup = state.teams[2].entries.map((entry, index) => ({
      ...entry,
      playerId: index === 0 ? "t3p2" : entry.playerId,
    }))
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: state.source,
        stateJson: JSON.stringify(state),
        localLineupJson: JSON.stringify(localLineup),
      },
    })

    const response = await GET_SEASON_LEAGUE(
      new Request(`http://localhost/api/season-leagues/${league.id}`),
      routeContext(league.id),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.state.teams[2].entries[0].playerId).toBe("t3p2")
    expect(payload.analysis.byTeam).toHaveLength(12)
  })
})

describe("PATCH /api/season-leagues/:id/lineup", () => {
  it("persists a valid local lineup and returns its effective analysis", async () => {
    const state = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const entries = state.teams[2].entries.map((entry, index) => ({
      ...entry,
      playerId: index === 0 ? "t3p2" : entry.playerId,
    }))
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        espnLeagueId: "fixture-league",
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: "espn",
        stateJson: JSON.stringify({ ...state, source: "espn" }),
      },
    })

    const response = await updateSeasonLeagueLineup(
      createRequest(
        `/api/season-leagues/${league.id}/lineup`,
        { entries },
        "PATCH",
      ),
      routeContext(league.id),
    )
    const payload = await response.json()
    const storedLeague = await db.seasonLeague.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(200)
    expect(payload.state.teams[2].entries).toEqual(entries)
    expect(payload.analysis.byTeam).toHaveLength(12)
    expect(storedLeague).toMatchObject({
      localLineupJson: JSON.stringify(entries),
      source: "mixed",
    })
  })

  it("rejects a lineup with players outside the league state", async () => {
    const state = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const entries = state.teams[2].entries.map((entry, index) => ({
      ...entry,
      playerId: index === 0 ? "not-in-state" : entry.playerId,
    }))
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: "manual",
        stateJson: JSON.stringify(state),
      },
    })

    const response = await updateSeasonLeagueLineup(
      createRequest(
        `/api/season-leagues/${league.id}/lineup`,
        { entries },
        "PATCH",
      ),
      routeContext(league.id),
    )
    const storedLeague = await db.seasonLeague.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(400)
    expect(storedLeague?.localLineupJson).toBeNull()
  })

  it("rejects a lineup containing another team's player", async () => {
    const state = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const perspectiveTeam = state.teams.find(
      (team) => team.teamIndex === state.perspectiveTeamIndex,
    )!
    const otherTeamPlayerId = state.teams
      .find((team) => team.teamIndex !== state.perspectiveTeamIndex)!
      .entries[0].playerId!
    const entries = perspectiveTeam.entries.map((entry, index) => ({
      ...entry,
      playerId: index === 0 ? otherTeamPlayerId : entry.playerId,
    }))
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: "manual",
        stateJson: JSON.stringify(state),
      },
    })

    const response = await updateSeasonLeagueLineup(
      createRequest(
        `/api/season-leagues/${league.id}/lineup`,
        { entries },
        "PATCH",
      ),
      routeContext(league.id),
    )

    expect(response.status).toBe(400)
  })
})

describe("POST /api/espn/season-import", () => {
  it("creates an ESPN season league from the adapter fixture", async () => {
    const response = await importEspnSeason(
      createRequest("/api/espn/season-import", {
        name: "Imported season league",
        leagueId: "fixture-league",
        season: fixture.season,
        teamId: 2,
      }),
    )
    const league = await response.json()

    expect(response.status).toBe(201)
    expect(league).toMatchObject({
      clerkUserId: currentUserId,
      name: "Imported season league",
      espnLeagueId: "fixture-league",
      season: fixture.season,
      source: "espn",
    })
  })
})

describe("POST /api/season-leagues/:id/refresh", () => {
  it("returns an incoming ESPN state without overwriting conflicting local lineup", async () => {
    const state = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    vi.mocked(espnImportToSeasonLeagueState).mockResolvedValueOnce({
      ...state,
      id: "fixture-league",
      source: "espn",
      espnTeamId: 2,
    })
    const localLineup = state.teams[2].entries.map((entry, index) => ({
      ...entry,
      playerId: index === 0 ? "local-player" : entry.playerId,
    }))
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        espnLeagueId: "fixture-league",
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: "mixed",
        stateJson: JSON.stringify(state),
        localLineupJson: JSON.stringify(localLineup),
      },
    })

    const response = await refreshSeasonLeague(
      new Request(
        `http://localhost/api/season-leagues/${league.id}/refresh`,
        { method: "POST" },
      ),
      routeContext(league.id),
    )
    const payload = await response.json()
    const storedLeague = await db.seasonLeague.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      conflict: true,
      incomingState: {
        id: "fixture-league",
        source: "espn",
      },
    })
    expect(storedLeague).toMatchObject({
      stateJson: JSON.stringify(state),
      localLineupJson: JSON.stringify(localLineup),
      source: "mixed",
      lastSyncedAt: null,
    })
  })

  it("does not overwrite state when ESPN credentials are missing", async () => {
    const previousEspnLive = process.env.ESPN_LIVE
    delete process.env.ESPN_LIVE
    await db.espnCredential.deleteMany({
      where: { clerkUserId: currentUserId },
    })

    try {
      const state = manualToSeasonLeagueState(
        fixture as ManualSeasonLeagueInput,
      )
      const league = await db.seasonLeague.create({
        data: {
          clerkUserId: currentUserId,
          name: state.name,
          espnLeagueId: "live-league",
          season: state.season,
          perspectiveTeamIndex: state.perspectiveTeamIndex,
          source: "espn",
          stateJson: JSON.stringify(state),
        },
      })

      const response = await refreshSeasonLeague(
        new Request(
          `http://localhost/api/season-leagues/${league.id}/refresh`,
          { method: "POST" },
        ),
        routeContext(league.id),
      )
      const payload = await response.json()
      const stored = await db.seasonLeague.findUnique({
        where: { id: league.id },
      })

      expect(response.status).toBe(502)
      expect(payload.errorCode).toBe("ESPN_NO_CREDENTIALS")
      expect(stored?.stateJson).toBe(JSON.stringify(state))
    } finally {
      if (previousEspnLive === undefined) {
        delete process.env.ESPN_LIVE
      } else {
        process.env.ESPN_LIVE = previousEspnLive
      }
    }
  })
})

describe("POST /api/season-leagues/:id/resolve-conflict", () => {
  it("applies ESPN state and clears a local lineup", async () => {
    const state = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const incomingState = {
      ...state,
      id: "fixture-league",
      source: "espn" as const,
    }
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        espnLeagueId: "fixture-league",
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: "mixed",
        stateJson: JSON.stringify(state),
        localLineupJson: JSON.stringify(state.teams[2].entries),
      },
    })

    const response = await resolveSeasonLeagueConflict(
      createRequest(`/api/season-leagues/${league.id}/resolve-conflict`, {
        resolution: "apply_espn",
        incomingState,
      }),
      routeContext(league.id),
    )
    const storedLeague = await db.seasonLeague.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(200)
    expect(storedLeague).toMatchObject({
      stateJson: JSON.stringify(incomingState),
      localLineupJson: null,
      source: "espn",
    })
  })

  it("keeps a local lineup while saving the incoming ESPN state", async () => {
    const state = manualToSeasonLeagueState(
      fixture as ManualSeasonLeagueInput,
    )
    const incomingState = {
      ...state,
      id: "fixture-league",
      source: "espn" as const,
    }
    const localLineup = state.teams[2].entries.map((entry, index) => ({
      ...entry,
      playerId: index === 0 ? "local-player" : entry.playerId,
    }))
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: currentUserId,
        name: state.name,
        espnLeagueId: "fixture-league",
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: "mixed",
        stateJson: JSON.stringify(state),
        localLineupJson: JSON.stringify(localLineup),
      },
    })

    const response = await resolveSeasonLeagueConflict(
      createRequest(`/api/season-leagues/${league.id}/resolve-conflict`, {
        resolution: "keep_local",
        incomingState,
      }),
      routeContext(league.id),
    )
    const storedLeague = await db.seasonLeague.findUnique({
      where: { id: league.id },
    })

    expect(response.status).toBe(200)
    expect(storedLeague).toMatchObject({
      stateJson: JSON.stringify(incomingState),
      localLineupJson: JSON.stringify(localLineup),
      source: "mixed",
    })
  })
})
