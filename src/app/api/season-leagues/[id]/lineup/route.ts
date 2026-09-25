import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { eligibleForSlot, rosterSlotsFor } from "@/lib/matchup/eligibility"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import { applyLocalLineup } from "@/lib/season/lineup"
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

const isValidLineup = (
  value: unknown,
  slots: ReturnType<typeof rosterSlotsFor>,
): value is SeasonRosterEntry[] =>
  Array.isArray(value) &&
  value.length === slots.length &&
  value.every((entry, index) => {
    if (!entry || typeof entry !== "object") return false
    const row = entry as Partial<SeasonRosterEntry>
    return (
      row.slot === slots[index] &&
      (typeof row.playerId === "string" || row.playerId === null)
    )
  })

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

  const slots = rosterSlotsFor(state)

  if (!isValidLineup(body.entries, slots)) {
    return NextResponse.json({ error: "validation" }, { status: 400 })
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

  const playersById = new Map(state.players.map((player) => [player.id, player]))
  if (
    body.entries.some((entry) => {
      if (!entry.playerId) return false
      return !eligibleForSlot(playersById.get(entry.playerId), entry.slot)
    })
  ) {
    return NextResponse.json({ error: "ineligible" }, { status: 400 })
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
