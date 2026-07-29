import { NextResponse } from "next/server"
import {
  EspnAdapterError,
  type EspnErrorCode,
} from "@/lib/adapters/errors"
import { espnImportToLeagueState } from "@/lib/adapters/espn"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"

const ESPN_LIMIT = 5
const ESPN_WINDOW_MS = 60_000
const ESPN_ERROR_CODES: EspnErrorCode[] = [
  "ESPN_AUTH",
  "ESPN_TIMEOUT",
  "ESPN_UNAVAILABLE",
  "ESPN_PARTIAL",
]

type ImportBody = {
  id?: unknown
  name?: unknown
  leagueId?: unknown
  season?: unknown
  swid?: unknown
  espnS2?: unknown
  forceFail?: unknown
}

const rateLimitedResponse = (retryAfterMs: number) =>
  NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: {
        "retry-after": String(Math.ceil(retryAfterMs / 1_000)),
      },
    },
  )

const adapterErrorResponse = (error: EspnAdapterError) =>
  NextResponse.json(
    { errorCode: error.code, message: error.message },
    { status: 502 },
  )

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

  const limit = rateLimit(`espn-import:${userId}`, ESPN_LIMIT, ESPN_WINDOW_MS)

  if (!limit.ok) {
    return rateLimitedResponse(limit.retryAfterMs ?? 0)
  }

  let body: ImportBody

  try {
    body = (await request.json()) as ImportBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    typeof body.leagueId !== "string" ||
    !body.leagueId.trim() ||
    typeof body.season !== "number" ||
    !Number.isInteger(body.season)
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const id = typeof body.id === "string" && body.id ? body.id : undefined
  const existingLeague = id
    ? await db.league.findFirst({
        where: { id, clerkUserId: userId },
      })
    : null

  if (id && !existingLeague) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  try {
    const state = await espnImportToLeagueState({
      leagueId: body.leagueId.trim(),
      season: body.season,
      swid: typeof body.swid === "string" ? body.swid : undefined,
      espnS2: typeof body.espnS2 === "string" ? body.espnS2 : undefined,
      forceFail:
        process.env.NODE_ENV === "test" && isErrorCode(body.forceFail)
          ? body.forceFail
          : undefined,
    })
    const requestedName =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : undefined
    const name =
      requestedName ??
      existingLeague?.name ??
      `ESPN League ${body.leagueId.trim()}`
    const data = {
      name,
      settingsJson: JSON.stringify(state.settings),
      stateJson: JSON.stringify(state),
    }

    if (existingLeague) {
      const league = await db.league.update({
        where: { id: existingLeague.id },
        data,
      })

      return NextResponse.json(league)
    }

    const league = await db.league.create({
      data: {
        clerkUserId: userId,
        ...data,
      },
    })

    return NextResponse.json(league, { status: 201 })
  } catch (error) {
    if (error instanceof EspnAdapterError) {
      return adapterErrorResponse(error)
    }

    throw error
  }
}
