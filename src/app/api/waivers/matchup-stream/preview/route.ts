import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { getMatchupSchedule } from "@/lib/matchup/scheduleLive"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"
import {
  isAllowedDayCount,
  previewMatchupStream,
} from "@/lib/waivers/matchupStream"

type PreviewBody = {
  seasonLeagueId?: unknown
  addPlayerId?: unknown
  dropPlayerId?: unknown
  opponentTeamIndex?: unknown
  dayCount?: unknown
}

const isValidDropPlayerId = (value: unknown): value is string | null =>
  value === null || typeof value === "string"

const parseOpponentTeamIndex = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined
  }

  return value
}

const parseDayCount = (value: unknown): number | undefined => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !isAllowedDayCount(value)
  ) {
    return undefined
  }

  return value
}

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: PreviewBody

  try {
    body = (await request.json()) as PreviewBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    typeof body.seasonLeagueId !== "string" ||
    !body.seasonLeagueId ||
    typeof body.addPlayerId !== "string" ||
    !body.addPlayerId ||
    !isValidDropPlayerId(body.dropPlayerId)
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const loaded = await loadOwnedSeasonLeague(body.seasonLeagueId, userId)
  if (loaded === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (loaded === "invalid_state") {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const schedule = await getMatchupSchedule()
  const result = previewMatchupStream({
    state: loaded.state,
    schedule,
    addPlayerId: body.addPlayerId,
    dropPlayerId: body.dropPlayerId,
    opponentTeamIndex: parseOpponentTeamIndex(body.opponentTeamIndex),
    dayCount: parseDayCount(body.dayCount),
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(result)
}
