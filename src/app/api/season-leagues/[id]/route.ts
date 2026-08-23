import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import { applyLocalLineup } from "@/lib/season/lineup"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"

type SeasonLeagueRouteContext = {
  params: Promise<{ id: string }>
}

const unauthorizedResponse = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 })

const notFoundResponse = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 })

export const GET = async (
  _request: Request,
  context: SeasonLeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const league = await db.seasonLeague.findFirst({
    where: {
      id,
      clerkUserId: userId,
    },
  })

  if (!league) return notFoundResponse()

  let state: SeasonLeagueState
  let localLineup: SeasonRosterEntry[] | null

  try {
    state = JSON.parse(league.stateJson) as SeasonLeagueState
    localLineup = league.localLineupJson
      ? (JSON.parse(league.localLineupJson) as SeasonRosterEntry[])
      : null
  } catch {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const effectiveState = applyLocalLineup(state, localLineup)

  return NextResponse.json({
    state: effectiveState,
    analysis: analyzeSeasonLeague(effectiveState),
  })
}

export const DELETE = async (
  _request: Request,
  context: SeasonLeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const league = await db.seasonLeague.findFirst({
    where: {
      id,
      clerkUserId: userId,
    },
    select: { id: true },
  })

  if (!league) return notFoundResponse()

  await db.seasonLeague.delete({ where: { id: league.id } })

  return NextResponse.json({ ok: true })
}
