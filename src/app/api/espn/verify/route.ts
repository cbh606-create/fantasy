import { NextResponse } from "next/server"
import { EspnAdapterError } from "@/lib/adapters/errors"
import { fetchEspnSeasonLeague } from "@/lib/adapters/espnSeasonLive"
import { requireUserId } from "@/lib/auth"
import { getUserEspnCookies } from "@/lib/espn/credentials"
import { readEnvEspnCookies } from "@/lib/espn/cookies"

type VerifyBody = {
  leagueId?: unknown
  season?: unknown
  teamId?: unknown
}

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: VerifyBody

  try {
    body = (await request.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    typeof body.leagueId !== "string" ||
    !body.leagueId.trim() ||
    typeof body.season !== "number" ||
    !Number.isInteger(body.season) ||
    typeof body.teamId !== "number" ||
    !Number.isInteger(body.teamId)
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const cookies =
    (await getUserEspnCookies(userId)) ?? readEnvEspnCookies() ?? undefined

  if (!cookies) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "ESPN_AUTH",
        message: "No ESPN cookies saved yet. Connect ESPN first.",
      },
      { status: 400 },
    )
  }

  try {
    const state = await fetchEspnSeasonLeague({
      leagueId: body.leagueId.trim(),
      season: body.season,
      teamId: body.teamId,
      cookies,
    })

    const you = state.teams[state.perspectiveTeamIndex]

    return NextResponse.json({
      ok: true,
      leagueName: state.name,
      teamName: you?.name ?? null,
      playerCount: state.players.length,
      teamCount: state.teams.length,
    })
  } catch (error) {
    if (error instanceof EspnAdapterError) {
      return NextResponse.json(
        {
          ok: false,
          errorCode: error.code,
          message: error.message,
        },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        errorCode: "ESPN_UNAVAILABLE",
        message: "Unable to verify ESPN connection",
      },
      { status: 500 },
    )
  }
}
