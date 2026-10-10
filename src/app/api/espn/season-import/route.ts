import { NextResponse } from "next/server"
import {
  EspnAdapterError,
  type EspnErrorCode,
} from "@/lib/adapters/errors"
import { espnImportToSeasonLeagueState } from "@/lib/adapters/espnSeason"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserEspnCookies } from "@/lib/espn/credentials"
import { readEnvEspnCookies } from "@/lib/espn/cookies"

const ESPN_ERROR_CODES: EspnErrorCode[] = [
  "ESPN_AUTH",
  "ESPN_TIMEOUT",
  "ESPN_UNAVAILABLE",
  "ESPN_PARTIAL",
  "ESPN_NO_CREDENTIALS",
]

type ImportSeasonLeagueBody = {
  name?: unknown
  leagueId?: unknown
  season?: unknown
  teamId?: unknown
  forceFail?: unknown
}

const isErrorCode = (value: unknown): value is EspnErrorCode =>
  typeof value === "string" &&
  ESPN_ERROR_CODES.includes(value as EspnErrorCode)

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: ImportSeasonLeagueBody

  try {
    body = (await request.json()) as ImportSeasonLeagueBody
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

  const allowFixtureImport =
    process.env.NODE_ENV === "test" || process.env.ESPN_ALLOW_FIXTURE === "true"

  const userCookies = await getUserEspnCookies(userId)
  const envCookies = readEnvEspnCookies()
  const cookies = userCookies ?? envCookies ?? undefined
  const canLiveImport =
    Boolean(cookies) &&
    (Boolean(userCookies) || process.env.ESPN_LIVE === "true")

  if (!canLiveImport && !allowFixtureImport) {
    return NextResponse.json(
      {
        errorCode: "ESPN_UNAVAILABLE",
        message:
          "Connect ESPN first (paste espn_s2 + SWID on this page), or set ESPN_LIVE=true with env cookies.",
      },
      { status: 503 },
    )
  }

  try {
    const state = await espnImportToSeasonLeagueState({
      leagueId: body.leagueId.trim(),
      season: body.season,
      teamId: body.teamId,
      cookies: canLiveImport ? cookies : undefined,
      forceFail:
        process.env.NODE_ENV === "test" && isErrorCode(body.forceFail)
          ? body.forceFail
          : undefined,
    })
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : state.name
    const league = await db.seasonLeague.create({
      data: {
        clerkUserId: userId,
        name,
        espnLeagueId: body.leagueId.trim(),
        season: state.season,
        perspectiveTeamIndex: state.perspectiveTeamIndex,
        source: state.source,
        stateJson: JSON.stringify({ ...state, name }),
        lastSyncedAt: new Date(),
      },
    })

    return NextResponse.json(league, { status: 201 })
  } catch (error) {
    if (error instanceof EspnAdapterError) {
      return NextResponse.json(
        { errorCode: error.code, message: error.message },
        { status: 502 },
      )
    }

    console.error("ESPN season import failed", error)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
