import { NextResponse } from "next/server"
import { manualToLeagueState } from "@/lib/adapters/manual"
import { manualLeagueInputSchema } from "@/lib/adapters/types"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import type { LeagueState } from "@/lib/domain/types"
import { getPlayerPool } from "@/lib/players/provider"

type CreateLeagueBody = {
  name?: unknown
  state?: unknown
  manualInput?: unknown
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

export const GET = async (): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  const leagues = await db.league.findMany({
    where: { clerkUserId: userId },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(leagues)
}

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  let body: CreateLeagueBody

  try {
    body = (await request.json()) as CreateLeagueBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  let state: LeagueState

  if (isLeagueState(body.state)) {
    state = body.state
  } else {
    const manualInput = manualLeagueInputSchema.safeParse(body.manualInput)

    if (!manualInput.success) {
      return NextResponse.json({ error: "validation" }, { status: 400 })
    }

    const players =
      manualInput.data.players && manualInput.data.players.length > 0
        ? manualInput.data.players
        : (
            await getPlayerPool(
              manualInput.data.playerPoolSource ?? "stats_2025_26",
            )
          ).players

    state = manualToLeagueState({
      ...manualInput.data,
      players,
    })
  }

  const league = await db.league.create({
    data: {
      clerkUserId: userId,
      name: body.name.trim(),
      settingsJson: JSON.stringify(state.settings),
      stateJson: JSON.stringify(state),
    },
  })

  return NextResponse.json(league, { status: 201 })
}
