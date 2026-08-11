import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type {
  SeasonLeagueState,
  SeasonRosterEntry,
} from "@/lib/season/types"

type SeasonLeagueRouteContext = {
  params: Promise<{ id: string }>
}

const unauthorizedResponse = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 })

const notFoundResponse = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 })

export const applyLocalLineup = (
  state: SeasonLeagueState,
  localLineup: SeasonRosterEntry[] | null,
): SeasonLeagueState => {
  if (!localLineup) return state

  return {
    ...state,
    localLineup,
    teams: state.teams.map((team) =>
      team.teamIndex === state.perspectiveTeamIndex
        ? { ...team, entries: localLineup }
        : team,
    ),
  }
}

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
