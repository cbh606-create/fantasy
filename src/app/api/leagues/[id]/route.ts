import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import type { LeagueState } from "@/lib/domain/types"

type LeagueRouteContext = {
  params: Promise<{ id: string }>
}

type UpdateLeagueBody = {
  name?: unknown
  state?: unknown
}

const isLeagueState = (value: unknown): value is LeagueState => {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<LeagueState>
  return Boolean(
    candidate.settings &&
      candidate.board &&
      Array.isArray(candidate.players) &&
      candidate.source &&
      typeof candidate.perspectiveTeamIndex === "number",
  )
}

const unauthorizedResponse = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 })

const notFoundResponse = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 })

export const GET = async (
  _request: Request,
  context: LeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const league = await db.league.findFirst({
    where: {
      id,
      clerkUserId: userId,
    },
  })

  if (!league) return notFoundResponse()

  return NextResponse.json(league)
}

export const PATCH = async (
  request: Request,
  context: LeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const league = await db.league.findFirst({
    where: {
      id,
      clerkUserId: userId,
    },
  })

  if (!league) return notFoundResponse()

  let body: UpdateLeagueBody

  try {
    body = (await request.json()) as UpdateLeagueBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (!isLeagueState(body.state)) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : league.name

  const updatedLeague = await db.league.update({
    where: { id },
    data: {
      name,
      settingsJson: JSON.stringify(body.state.settings),
      stateJson: JSON.stringify(body.state),
    },
  })

  return NextResponse.json(updatedLeague)
}
