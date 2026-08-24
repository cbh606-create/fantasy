import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { applySitStartSwap } from "@/lib/matchup/sitStart"
import { applyLocalLineup } from "@/lib/season/lineup"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"
import { rateLimit } from "@/lib/rateLimit"

const APPLY_LIMIT = 10
const APPLY_WINDOW_MS = 60_000

type ApplyLineupBody = {
  seasonLeagueId?: unknown
  benchPlayerId?: unknown
  activePlayerId?: unknown
}

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limit = rateLimit(
    `matchup-apply-lineup:${userId}`,
    APPLY_LIMIT,
    APPLY_WINDOW_MS,
  )
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
  }

  let body: ApplyLineupBody

  try {
    body = (await request.json()) as ApplyLineupBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    typeof body.seasonLeagueId !== "string" ||
    !body.seasonLeagueId ||
    typeof body.benchPlayerId !== "string" ||
    !body.benchPlayerId ||
    typeof body.activePlayerId !== "string" ||
    !body.activePlayerId
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const league = await db.seasonLeague.findFirst({
    where: { id: body.seasonLeagueId, clerkUserId: userId },
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

  const currentState = applyLocalLineup(state, localLineup)
  const youTeam = currentState.teams.find(
    (team) => team.teamIndex === currentState.perspectiveTeamIndex,
  )

  if (!youTeam) {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const result = applySitStartSwap(youTeam.entries, {
    benchPlayerId: body.benchPlayerId,
    activePlayerId: body.activePlayerId,
  }, currentState.players)

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  await db.seasonLeague.update({
    where: { id: league.id },
    data: {
      localLineupJson: JSON.stringify(result),
      source: league.source === "espn" ? "mixed" : league.source,
    },
  })

  return NextResponse.json({
    ok: true,
    entries: result,
  })
}
