import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { selectBreakouts } from "@/lib/injuries/breakout"
import { loadEspnBreakoutPlayers } from "@/lib/injuries/espnStatCache"
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"
import type { SeasonPlayer } from "@/lib/season/types"
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

  const now = new Date()
  const stats = await loadEspnBreakoutPlayers({ seasonId: loaded.state.season, now })
  if (stats.source === "empty") {
    return NextResponse.json({ recommendations: [], source: "empty" })
  }

  const cached = await loadInjurySelectionInputs({
    now,
    espnPlayers: loaded.state.players.map((player: SeasonPlayer) => ({
      id: player.id,
      name: player.name,
      teamAbbr: player.teamAbbr,
    })),
  })
  const recommendations = selectBreakouts({
    players: stats.players,
    availablePlayerIds: loaded.state.availablePlayerIds,
    lineups: cached.lineups,
    depth: cached.depth,
    updates: cached.updates,
    crosswalk: cached.crosswalk,
    now,
  })

  return NextResponse.json({ recommendations, source: "espn" })
}
