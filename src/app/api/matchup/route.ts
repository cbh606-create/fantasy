import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { adviseMatchup } from "@/lib/matchup/advise"
import { getMatchupSchedule } from "@/lib/matchup/scheduleLive"
import type { MatchupAdvice } from "@/lib/matchup/types"
import type { SeasonLeagueState } from "@/lib/season/types"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"

const parseOpponentTeamIndex = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return null

  return parsed
}

const defaultOpponentIndex = (state: SeasonLeagueState): number | null => {
  const opponent = state.teams.find(
    (team) => team.teamIndex !== state.perspectiveTeamIndex,
  )
  return opponent?.teamIndex ?? null
}

const collectReferencedPlayerIds = (
  state: SeasonLeagueState,
  advice: MatchupAdvice,
): Set<string> => {
  const ids = new Set<string>()

  const youTeam = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  const oppTeam = state.teams.find(
    (team) => team.teamIndex === advice.opponentTeamIndex,
  )

  for (const team of [youTeam, oppTeam]) {
    if (!team) continue

    for (const entry of team.entries) {
      if (entry.playerId) {
        ids.add(entry.playerId)
      }
    }
  }

  for (const suggestion of advice.sitStart) {
    ids.add(suggestion.benchPlayerId)
    ids.add(suggestion.activePlayerId)
  }

  for (const streamer of advice.streamers) {
    ids.add(streamer.playerId)
  }

  for (const plan of advice.streamingPlans) {
    for (const day of plan.days) {
      for (const cell of day.cells) {
        if (cell.playerId) ids.add(cell.playerId)
      }
    }
  }

  return ids
}

export const GET = async (request: Request): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const seasonLeagueId = params.get("seasonLeagueId")
  const opponentRaw = params.get("opponentTeamIndex")
  const includeState = params.get("includeState") === "1"

  if (!seasonLeagueId || opponentRaw === null) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const loaded = await loadOwnedSeasonLeague(seasonLeagueId, userId)
  if (loaded === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (loaded === "invalid_state") {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  let opponentTeamIndex: number | null

  if (opponentRaw === "auto") {
    opponentTeamIndex = defaultOpponentIndex(loaded.state)
    if (opponentTeamIndex === null) {
      return NextResponse.json({ error: "no_opponent" }, { status: 400 })
    }
  } else {
    opponentTeamIndex = parseOpponentTeamIndex(opponentRaw)
    if (opponentTeamIndex === null) {
      return NextResponse.json({ error: "validation" }, { status: 400 })
    }
  }

  const schedule = await getMatchupSchedule()
  const advice = adviseMatchup(loaded.state, schedule, opponentTeamIndex)

  if ("error" in advice) {
    return NextResponse.json({ error: advice.error }, { status: 400 })
  }

  const referencedPlayerIds = collectReferencedPlayerIds(loaded.state, advice)
  const playersById = Object.fromEntries(
    loaded.state.players.flatMap((player) =>
      referencedPlayerIds.has(player.id) ? [[player.id, player] as const] : [],
    ),
  )
  const teams = loaded.state.teams.map((team) => ({
    teamIndex: team.teamIndex,
    name: team.name,
  }))

  return NextResponse.json({
    ...advice,
    schedule,
    playersById,
    teams,
    ...(includeState ? { state: loaded.state } : {}),
  })
}
