import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonPlayer } from "@/lib/season/types"
import { teamNeedsAndSurplus } from "@/lib/trade/needs"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"
import { recommendPickups } from "@/lib/waivers/recommend"
import { youWaiverRank } from "@/lib/waivers/rank"

type AvailablePlayerSummary = {
  id: string
  name: string
  teamAbbr?: string
  availability: NonNullable<SeasonPlayer["availability"]>
}

const summarizeAvailablePlayer = (
  player: SeasonPlayer,
): AvailablePlayerSummary => ({
  id: player.id,
  name: player.name,
  teamAbbr: player.teamAbbr,
  availability: player.availability ?? "fa",
})

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

  const { state } = loaded
  const analysis = analyzeSeasonLeague(state)
  const { need } = teamNeedsAndSurplus(analysis, state.perspectiveTeamIndex)
  const recommendations = recommendPickups(state)
  const playersById = Object.fromEntries(
    state.availablePlayerIds.flatMap((playerId) => {
      const player = state.players.find((candidate) => candidate.id === playerId)
      return player ? [[playerId, player] as const] : []
    }),
  )
  const available = state.availablePlayerIds.flatMap((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId)
    return player ? [summarizeAvailablePlayer(player)] : []
  })

  return NextResponse.json({
    available,
    waiverOrder: state.waiverOrder,
    youWaiverRank: youWaiverRank(state),
    youNeeds: need,
    recommendations,
    playersById,
  })
}
