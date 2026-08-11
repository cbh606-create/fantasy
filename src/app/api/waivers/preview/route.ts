import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { rateLimit } from "@/lib/rateLimit"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"
import { previewAddDrop } from "@/lib/waivers/preview"

const PREVIEW_LIMIT = 10
const PREVIEW_WINDOW_MS = 60_000

type PreviewBody = {
  seasonLeagueId?: unknown
  addPlayerId?: unknown
  dropPlayerId?: unknown
}

const isValidDropPlayerId = (value: unknown): value is string | null =>
  value === null || typeof value === "string"

export const POST = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limit = rateLimit(
    `waivers-preview:${userId}`,
    PREVIEW_LIMIT,
    PREVIEW_WINDOW_MS,
  )
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
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

  const preview = previewAddDrop(loaded.state, {
    addPlayerId: body.addPlayerId,
    dropPlayerId: body.dropPlayerId,
  })

  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: 400 })
  }

  return NextResponse.json(preview)
}
