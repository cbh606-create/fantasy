import { headers } from "next/headers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as importEspnSeason } from "@/app/api/espn/season-import/route"
import {
  GET as GET_LIST,
  POST,
} from "@/app/api/season-leagues/route"
import { GET as GET_SEASON_LEAGUE } from "@/app/api/season-leagues/[id]/route"
import { POST as refreshSeasonLeague } from "@/app/api/season-leagues/[id]/refresh/route"
import { POST as resolveSeasonLeagueConflict } from "@/app/api/season-leagues/[id]/resolve-conflict/route"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { db } from "@/lib/db"
import type { SeasonLeagueState } from "@/lib/season/types"
import fixture from "../../data/fixtures/espn-season-league.json"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const testUserPrefix = `season-leagues-api-${crypto.randomUUID()}`
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

describe("POST /api/espn/season-import", () => {
  it("creates an ESPN season league from the adapter fixture", async () => {
    const response = await importEspnSeason(
      createRequest("/api/espn/season-import", {
        name: "Imported season league",
        leagueId: "fixture-league",
        season: fixture.season,
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
