import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import {
  fixtureDepthChartProvider,
  fixtureInjuryEventProvider,
} from "@/lib/injuries/providers"
import { recommendInjuryPickups } from "@/lib/injuries/recommend"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"

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

  const loaded = await loadOwnedSeasonLeague(seasonLeagueId, userId)
  if (loaded === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (loaded === "invalid_state") {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const result = recommendInjuryPickups({
    state: loaded.state,
    depth: fixtureDepthChartProvider,
    injuries: fixtureInjuryEventProvider,
  })

  return NextResponse.json(result)
}
