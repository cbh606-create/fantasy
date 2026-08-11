import { NextResponse } from "next/server"
import scheduleFixture from "../../../../data/fixtures/nba-matchup-schedule.json"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import type { ScheduleResponse } from "@/lib/season/types"

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
    select: { id: true },
  })
  if (!league) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json(scheduleFixture as ScheduleResponse)
}
