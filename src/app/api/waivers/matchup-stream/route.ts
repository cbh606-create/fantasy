import { NextResponse } from "next/server"
import scheduleFixture from "../../../../../data/fixtures/nba-matchup-schedule.json"
import { requireUserId } from "@/lib/auth"
import type { ScheduleResponse } from "@/lib/season/types"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"
import {
  isAllowedDayCount,
  recommendMatchupStream,
} from "@/lib/waivers/matchupStream"

const parseOpponentTeamIndex = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return undefined

  return parsed
}

const parseDayCount = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || !isAllowedDayCount(parsed)) return undefined

  return parsed
}

export const GET = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const seasonLeagueId = params.get("seasonLeagueId")
  if (!seasonLeagueId) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const loaded = await loadOwnedSeasonLeague(seasonLeagueId, userId)
  if (loaded === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (loaded === "invalid_state") {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const opponentTeamIndex = parseOpponentTeamIndex(
    params.get("opponentTeamIndex"),
  )
  const dayCount = parseDayCount(params.get("dayCount"))
  const schedule = scheduleFixture as ScheduleResponse
  const result = recommendMatchupStream({
    state: loaded.state,
    schedule,
    opponentTeamIndex,
    dayCount,
  })

  return NextResponse.json(result)
}
