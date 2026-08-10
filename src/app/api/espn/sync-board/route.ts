import { NextResponse } from "next/server"
import {
  EspnAdapterError,
  type EspnErrorCode,
} from "@/lib/adapters/errors"
import { espnSyncBoard } from "@/lib/adapters/espn"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import type { LeagueState } from "@/lib/domain/types"
import { rateLimit } from "@/lib/rateLimit"

const ESPN_LIMIT = 5
const ESPN_WINDOW_MS = 60_000
const ESPN_ERROR_CODES: EspnErrorCode[] = [
  "ESPN_AUTH",
  "ESPN_TIMEOUT",
  "ESPN_UNAVAILABLE",
  "ESPN_PARTIAL",
]

type SyncBody = {
  id?: unknown
  leagueId?: unknown
  season?: unknown
  swid?: unknown
  espnS2?: unknown
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

  const limit = rateLimit(`espn-sync:${userId}`, ESPN_LIMIT, ESPN_WINDOW_MS)

  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "retry-after": String(
            Math.ceil((limit.retryAfterMs ?? 0) / 1_000),
          ),
        },
      },
    )
  }

  let body: SyncBody

  try {
    body = (await request.json()) as SyncBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    typeof body.id !== "string" ||
    !body.id ||
    typeof body.leagueId !== "string" ||
    !body.leagueId.trim() ||
    typeof body.season !== "number" ||
    !Number.isInteger(body.season)
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const league = await db.league.findFirst({
    where: {
      id: body.id,
      clerkUserId: userId,
    },
  })

  if (!league) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  try {
    const result = await espnSyncBoard(
      JSON.parse(league.stateJson) as LeagueState,
      {
        leagueId: body.leagueId.trim(),
        season: body.season,
        swid: typeof body.swid === "string" ? body.swid : undefined,
        espnS2: typeof body.espnS2 === "string" ? body.espnS2 : undefined,
        forceFail:
          process.env.NODE_ENV === "test" && isErrorCode(body.forceFail)
            ? body.forceFail
            : undefined,
      },
    )
    const updatedLeague = await db.league.update({
      where: { id: league.id },
      data: {
        settingsJson: JSON.stringify(result.state.settings),
        stateJson: JSON.stringify(result.state),
      },
    })

    return NextResponse.json({
      league: updatedLeague,
      conflicts: result.conflicts,
    })
  } catch (error) {
    if (error instanceof EspnAdapterError) {
      return NextResponse.json(
        { errorCode: error.code, message: error.message },
        { status: 502 },
      )
    }

    console.error("ESPN sync failed", error)
    return NextResponse.json(
      {
        error: "server_error",
        message:
          error instanceof Error ? error.message : "Unable to sync ESPN board",
      },
      { status: 500 },
    )
  }
}
