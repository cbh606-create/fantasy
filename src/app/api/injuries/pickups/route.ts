import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { loadInjurySelectionInputs } from "@/lib/injuries/rotowireCache"
import { selectInjuryReplacements, type InjuryReplacement } from "@/lib/injuries/selection"
import type { InjuryEvent, InjuryPickupRecommendation, InjuryPickupsResult } from "@/lib/injuries/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { loadOwnedSeasonLeague } from "@/lib/waivers/loadSeasonLeague"

const youRosterIds = (state: SeasonLeagueState): Set<string> => {
  const youTeam = state.teams.find((team) => team.teamIndex === state.perspectiveTeamIndex)
  return new Set(
    (youTeam?.entries ?? [])
      .map((entry) => entry.playerId)
      .filter((playerId): playerId is string => playerId !== null),
  )
}

const toPickups = (
  state: SeasonLeagueState,
  cached: Awaited<ReturnType<typeof loadInjurySelectionInputs>>,
): InjuryPickupsResult => {
  const names = new Map(state.players.map((player) => [player.id, player]))
  const rosterIds = youRosterIds(state)
  const rows = selectInjuryReplacements({
    ...cached,
    availablePlayerIds: state.availablePlayerIds,
    now: new Date(),
  })
  const loaded =
    cached.updates.length > 0 ||
    cached.depth.teams.length > 0 ||
    cached.lineups.length > 0 ||
    cached.crosswalk.size > 0

  const events: InjuryEvent[] = rows.flatMap((row) => {
    if (row.status === "traded") return []
    return [
      {
        playerId: row.injuredPlayerId,
        teamAbbr: names.get(row.injuredPlayerId)?.teamAbbr ?? "",
        status: row.status,
      },
    ]
  })

  const reasonsFor = (row: InjuryReplacement): string[] => {
    const source = row.source === "lineup" ? "Confirmed lineup" : "Depth chart"
    return row.status === "traded" ? ["Trade", source] : [source]
  }

  const recommendations: InjuryPickupRecommendation[] = rows.map((row) => {
    const injured = names.get(row.injuredPlayerId)
    const add = names.get(row.addPlayerId)
    return {
      injuredPlayerId: row.injuredPlayerId,
      injuredPlayerName: injured?.name ?? row.injuredPlayerId,
      addPlayerId: row.addPlayerId,
      addPlayerName: add?.name ?? row.addPlayerId,
      teamAbbr: add?.teamAbbr ?? injured?.teamAbbr ?? "",
      status: row.status,
      depthRank: row.source === "depth" ? 1 : 0,
      urgency: rosterIds.has(row.injuredPlayerId) ? "roster" : "league",
      score: 0,
      reasons: reasonsFor(row),
    }
  })

  return {
    events,
    recommendations,
    source: loaded
      ? { depth: "rotowire", injuries: "rotowire" }
      : { depth: "empty", injuries: "empty" },
  }
}

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

  const cached = await loadInjurySelectionInputs({
    now: new Date(),
    espnPlayers: loaded.state.players.map((player: SeasonPlayer) => ({
      id: player.id,
      name: player.name,
      teamAbbr: player.teamAbbr,
    })),
  })

  return NextResponse.json(toPickups(loaded.state, cached))
}
