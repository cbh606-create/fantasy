import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import type { SeasonLeagueState } from "@/lib/season/types"

type SeasonLeagueRouteContext = {
  params: Promise<{ id: string }>
}

type ResolveConflictBody = {
  resolution?: unknown
  incomingState?: unknown
}

const unauthorizedResponse = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 })

const notFoundResponse = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 })

const isSeasonLeagueState = (value: unknown): value is SeasonLeagueState => {
  if (!value || typeof value !== "object") return false

  const state = value as Partial<SeasonLeagueState>

  return (
    typeof state.name === "string" &&
    typeof state.season === "number" &&
    typeof state.perspectiveTeamIndex === "number" &&
    Array.isArray(state.categories) &&
    Array.isArray(state.teams) &&
    Array.isArray(state.players) &&
    state.source === "espn"
  )
}

export const POST = async (
  request: Request,
  context: SeasonLeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  let body: ResolveConflictBody

  try {
    body = (await request.json()) as ResolveConflictBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    (body.resolution !== "apply_espn" && body.resolution !== "keep_local") ||
    !isSeasonLeagueState(body.incomingState)
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const { id } = await context.params
  const league = await db.seasonLeague.findFirst({
    where: { id, clerkUserId: userId },
  })

  if (!league) return notFoundResponse()

  const updatedLeague = await db.seasonLeague.update({
    where: { id: league.id },
    data: {
      stateJson: JSON.stringify(body.incomingState),
      localLineupJson:
        body.resolution === "apply_espn" ? null : league.localLineupJson,
      source: body.resolution === "apply_espn" ? "espn" : "mixed",
      lastSyncedAt: new Date(),
    },
  })

  return NextResponse.json(updatedLeague)
}
