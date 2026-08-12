import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { applyLocalLineup } from "@/lib/season/lineup"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"
import { suggestTrades } from "@/lib/trade/suggest"

const SUGGESTIONS_LIMIT = 10
const SUGGESTIONS_WINDOW_MS = 60_000

export const GET = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limit = rateLimit(
    `trade-suggestions:${userId}`,
    SUGGESTIONS_LIMIT,
    SUGGESTIONS_WINDOW_MS,
  )
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
  }

  const seasonLeagueId = new URL(request.url).searchParams.get("seasonLeagueId")
  if (!seasonLeagueId) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const league = await db.seasonLeague.findFirst({
    where: { id: seasonLeagueId, clerkUserId: userId },
  })
  if (!league) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

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
  const result = suggestTrades(effectiveState)

  return NextResponse.json({
    ...result,
    analysisPerspectiveTeamIndex: effectiveState.perspectiveTeamIndex,
    state: effectiveState,
  })
}
