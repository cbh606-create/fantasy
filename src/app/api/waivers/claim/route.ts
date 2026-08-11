import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { applyAddDrop } from "@/lib/waivers/apply"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"
import { previewAddDrop } from "@/lib/waivers/preview"
import { youWaiverRank } from "@/lib/waivers/rank"

const CLAIM_LIMIT = 10
const CLAIM_WINDOW_MS = 60_000

type ClaimBody = {
  seasonLeagueId?: unknown
  addPlayerId?: unknown
  dropPlayerId?: unknown
  assumeSuccess?: unknown
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
    `waivers-claim:${userId}`,
    CLAIM_LIMIT,
    CLAIM_WINDOW_MS,
  )
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    )
  }

  let body: ClaimBody

  try {
    body = (await request.json()) as ClaimBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (
    typeof body.seasonLeagueId !== "string" ||
    !body.seasonLeagueId ||
    typeof body.addPlayerId !== "string" ||
    !body.addPlayerId ||
    !isValidDropPlayerId(body.dropPlayerId) ||
    (body.assumeSuccess !== undefined && typeof body.assumeSuccess !== "boolean")
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

  const input = {
    addPlayerId: body.addPlayerId,
    dropPlayerId: body.dropPlayerId,
  }
  const preview = previewAddDrop(loaded.state, input)

  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: 400 })
  }

  if (preview.requiresAssumeSuccess && body.assumeSuccess !== true) {
    return NextResponse.json({ error: "assume_required" }, { status: 409 })
  }

  const applied = applyAddDrop(loaded.state, input)

  if ("error" in applied) {
    return NextResponse.json({ error: applied.error }, { status: 400 })
  }

  await db.seasonLeague.update({
    where: { id: loaded.id },
    data: {
      stateJson: JSON.stringify(applied),
      localLineupJson: null,
    },
  })

  return NextResponse.json({
    ok: true,
    youWaiverRank: youWaiverRank(applied),
    requiresAssumeSuccess: preview.requiresAssumeSuccess,
  })
}
