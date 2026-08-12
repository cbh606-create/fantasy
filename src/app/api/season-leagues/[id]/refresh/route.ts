import { NextResponse } from "next/server"
import {
  espnImportToSeasonLeagueState,
  detectLineupConflict,
} from "@/lib/adapters/espnSeason"
import { EspnAdapterError } from "@/lib/adapters/errors"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"

type SeasonLeagueRouteContext = {
  params: Promise<{ id: string }>
}

const unauthorizedResponse = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 })

const notFoundResponse = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 })

export const POST = async (
  _request: Request,
  context: SeasonLeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  const limit = rateLimit(`season-league-refresh:${userId}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
  }

  const { id } = await context.params
  const league = await db.seasonLeague.findFirst({
    where: { id, clerkUserId: userId },
  })

  if (!league) return notFoundResponse()
  if (!league.espnLeagueId) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  let localLineup: SeasonRosterEntry[] | null

  try {
    localLineup = league.localLineupJson
      ? (JSON.parse(league.localLineupJson) as SeasonRosterEntry[])
      : null
  } catch {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  try {
    let storedState: SeasonLeagueState | null = null
    try {
      storedState = JSON.parse(league.stateJson) as SeasonLeagueState
    } catch {
      storedState = null
    }

    const importedState = await espnImportToSeasonLeagueState({
      leagueId: league.espnLeagueId,
      season: league.season,
      teamId: storedState?.espnTeamId,
    })
    const incomingState: SeasonLeagueState = {
      ...importedState,
      name: league.name,
      espnTeamId: storedState?.espnTeamId ?? importedState.espnTeamId,
    }
    const incomingEntries = incomingState.teams.find(
      (team) => team.teamIndex === incomingState.perspectiveTeamIndex,
    )?.entries

    if (
      localLineup &&
      incomingEntries &&
      detectLineupConflict(incomingEntries, localLineup)
    ) {
      return NextResponse.json({ conflict: true, incomingState })
    }

    const updatedLeague = await db.seasonLeague.update({
      where: { id: league.id },
      data: {
        stateJson: JSON.stringify(incomingState),
        localLineupJson: null,
        source: "espn",
        lastSyncedAt: new Date(),
      },
    })

    return NextResponse.json(updatedLeague)
  } catch (error) {
    if (error instanceof EspnAdapterError) {
      return NextResponse.json(
        { errorCode: error.code, message: error.message },
        { status: 502 },
      )
    }

    console.error("ESPN season refresh failed", error)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
