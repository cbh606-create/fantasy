import { NextResponse } from "next/server"
import {
  espnImportPreferringNewerSeason,
  detectLineupConflict,
} from "@/lib/adapters/espnSeason"
import { EspnAdapterError } from "@/lib/adapters/errors"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { readEnvEspnCookies } from "@/lib/espn/cookies"
import { getUserEspnCookies } from "@/lib/espn/credentials"
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

    const userCookies = await getUserEspnCookies(userId)
    const envCookies = readEnvEspnCookies()
    const cookies =
      userCookies ??
      (process.env.ESPN_LIVE === "true" ? envCookies : null) ??
      undefined

    const importedState = await espnImportPreferringNewerSeason({
      leagueId: league.espnLeagueId,
      season: league.season,
      teamId: storedState?.espnTeamId,
      cookies,
      forbidFixture: true,
    })
    const importedName = importedState.name.trim()
    const incomingState: SeasonLeagueState = {
      ...importedState,
      name: importedName || league.name,
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

    const syncedAt = new Date()
    const stateToStore: SeasonLeagueState = {
      ...incomingState,
      lastSyncedAt: syncedAt.toISOString(),
    }
    const updatedLeague = await db.seasonLeague.update({
      where: { id: league.id },
      data: {
        name: incomingState.name,
        season: incomingState.season,
        stateJson: JSON.stringify(stateToStore),
        localLineupJson: null,
        ...(incomingState.season !== league.season
          ? { morningCheckJson: null }
          : {}),
        source: "espn",
        lastSyncedAt: syncedAt,
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
