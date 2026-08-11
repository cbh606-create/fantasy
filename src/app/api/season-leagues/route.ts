import { NextResponse } from "next/server"
import manualSeasonLeagueFixture from "../../../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "@/lib/adapters/manualSeason"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"

type CreateSeasonLeagueBody = {
  name?: unknown
  manual?: unknown
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

  const leagues = await db.seasonLeague.findMany({
    where: { clerkUserId: userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      espnLeagueId: true,
      season: true,
      perspectiveTeamIndex: true,
      source: true,
      lastSyncedAt: true,
      createdAt: true,
      updatedAt: true,
    },
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

  let body: CreateSeasonLeagueBody

  try {
    body = (await request.json()) as CreateSeasonLeagueBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (body.manual !== undefined && body.manual !== true) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const state = manualToSeasonLeagueState({
    ...(manualSeasonLeagueFixture as ManualSeasonLeagueInput),
    name: body.name.trim(),
  })
  const league = await db.seasonLeague.create({
    data: {
      clerkUserId: userId,
      name: state.name,
      season: state.season,
      perspectiveTeamIndex: state.perspectiveTeamIndex,
      source: state.source,
      stateJson: JSON.stringify(state),
    },
  })

  return NextResponse.json(league, { status: 201 })
}
