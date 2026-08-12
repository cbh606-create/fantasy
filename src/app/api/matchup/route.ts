import { NextResponse } from "next/server"
import scheduleFixture from "../../../../data/fixtures/nba-matchup-schedule.json"
import { requireUserId } from "@/lib/auth"
import { adviseMatchup } from "@/lib/matchup/advise"
import { isActiveSlot } from "@/lib/matchup/constants"
import type { MatchupAdvice } from "@/lib/matchup/types"
import type { ScheduleResponse, SeasonLeagueState } from "@/lib/season/types"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"

const parseOpponentTeamIndex = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return null

  return parsed
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
      if (entry.playerId && isActiveSlot(entry.slot)) {
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
  const opponentTeamIndex = parseOpponentTeamIndex(
    params.get("opponentTeamIndex"),
  )

  if (!seasonLeagueId || opponentTeamIndex === null) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const loaded = await loadOwnedSeasonLeague(seasonLeagueId, userId)
  if (loaded === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (loaded === "invalid_state") {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const schedule = scheduleFixture as ScheduleResponse
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
    playersById,
    teams,
  })
}
