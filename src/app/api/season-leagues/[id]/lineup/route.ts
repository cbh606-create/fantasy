import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import { applyLocalLineup } from "@/lib/season/lineup"
import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonLeagueState, SeasonRosterEntry } from "@/lib/season/types"

type SeasonLeagueRouteContext = {
  params: Promise<{ id: string }>
}

type LineupBody = {
  entries?: unknown
}

const unauthorizedResponse = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 })

const notFoundResponse = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 })

const isSeasonRosterEntry = (
  value: unknown,
  index: number,
): value is SeasonRosterEntry => {
  if (!value || typeof value !== "object") return false

  const entry = value as Partial<SeasonRosterEntry>

  return (
    entry.slot === SEASON_ROSTER_SLOTS[index] &&
    (typeof entry.playerId === "string" || entry.playerId === null)
  )
}

const isValidLineup = (value: unknown): value is SeasonRosterEntry[] =>
  Array.isArray(value) &&
  value.length === SEASON_ROSTER_SLOTS.length &&
  value.every((entry, index) => isSeasonRosterEntry(entry, index))

export const PATCH = async (
  request: Request,
  context: SeasonLeagueRouteContext,
): Promise<Response> => {
  let userId: string

  try {
    userId = await requireUserId()
  } catch {
    return unauthorizedResponse()
  }

  let body: LineupBody

  try {
    body = (await request.json()) as LineupBody
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  if (!isValidLineup(body.entries)) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const { id } = await context.params
  const league = await db.seasonLeague.findFirst({
    where: { id, clerkUserId: userId },
  })

  if (!league) return notFoundResponse()

  let state: SeasonLeagueState
  let localLineup: SeasonRosterEntry[] | null

  try {
    state = JSON.parse(league.stateJson) as SeasonLeagueState
    localLineup = league.localLineupJson
      ? (JSON.parse(league.localLineupJson) as SeasonRosterEntry[])
      : null
  } catch {
    return NextResponse.json({ error: "invalid_state" }, { status: 500 })
  }

  const playerIds = new Set(state.players.map((player) => player.id))
  const currentState = applyLocalLineup(state, localLineup)
  const perspectivePlayerIds = new Set(
    currentState.teams
      .find((team) => team.teamIndex === currentState.perspectiveTeamIndex)
      ?.entries.flatMap((entry) => entry.playerId ? [entry.playerId] : []) ?? [],
  )
  if (
    body.entries.some(
      (entry) =>
        entry.playerId !== null &&
        (!playerIds.has(entry.playerId) || !perspectivePlayerIds.has(entry.playerId)),
    )
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
  }

  const effectiveState = applyLocalLineup(state, body.entries)

  await db.seasonLeague.update({
    where: { id: league.id },
    data: {
      localLineupJson: JSON.stringify(body.entries),
      source: league.source === "espn" ? "mixed" : league.source,
    },
  })

  return NextResponse.json({
    state: effectiveState,
    analysis: analyzeSeasonLeague(effectiveState),
  })
}
