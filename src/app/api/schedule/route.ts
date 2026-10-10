import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserEspnCookies } from "@/lib/espn/credentials"
import { readEnvEspnCookies } from "@/lib/espn/cookies"
import { fetchEspnFantasyMatchupWindow } from "@/lib/espn/fantasyMatchupSchedule"
import { getMatchupSchedule } from "@/lib/matchup/scheduleLive"
import type { SeasonLeagueState } from "@/lib/season/types"

export const GET = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
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

  let state: SeasonLeagueState | null = null
  try {
    state = JSON.parse(league.stateJson) as SeasonLeagueState
  } catch {
    state = null
  }

  if (
    league.source === "espn" &&
    league.espnLeagueId &&
    state?.espnTeamId != null
  ) {
    const userCookies = await getUserEspnCookies(userId)
    const envCookies =
      process.env.ESPN_LIVE === "true" ? readEnvEspnCookies() : null
    const cookies = userCookies ?? envCookies
    if (cookies) {
      try {
        const window = await fetchEspnFantasyMatchupWindow({
          leagueId: league.espnLeagueId,
          season: league.season,
          youEspnTeamId: state.espnTeamId,
          cookies,
        })
        return NextResponse.json(window.schedule)
      } catch (error) {
        console.warn(
          "ESPN fantasy schedule unavailable for /api/schedule",
          error instanceof Error ? error.message : "error",
        )
      }
    }
  }

  const schedule = await getMatchupSchedule()
  return NextResponse.json(schedule)
}
