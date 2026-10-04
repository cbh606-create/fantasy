import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { db } from "@/lib/db"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import { getUserEspnCookies } from "@/lib/espn/credentials"
import { fetchEspnDayActuals } from "@/lib/espn/dayBoxScore"
import { loadWinnerStreamRecipes } from "@/lib/espn/winnerStreamHistory"
import { adviseMatchup } from "@/lib/matchup/advise"
import { loadStatPairs } from "@/lib/players/loadStatPairs"
import type { StatPairRow } from "@/lib/players/statPairCorrelation"
import type { DayActuals } from "@/lib/matchup/morningCheck"
import {
  actualsFromClosedDays,
  morningCheckForOpponent,
  parseMorningCheck,
} from "@/lib/matchup/morningCheckStore"
import { getMatchupSchedule } from "@/lib/matchup/scheduleLive"
import {
  isStatWindow,
  type MatchupAdvice,
  type WinnerStreamRecipe,
} from "@/lib/matchup/types"
import type { SeasonLeagueState } from "@/lib/season/types"
import {
  loadOwnedSeasonLeague,
  type LoadedSeasonLeague,
} from "@/lib/waivers/loadSeasonLeague"

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

const loadMatchupWinnerRecipes = async (
  loaded: LoadedSeasonLeague,
  userId: string,
): Promise<WinnerStreamRecipe[]> => {
  if (loaded.state.source !== "espn" || !loaded.espnLeagueId) return []
  try {
    const cookies = await getUserEspnCookies(userId)
    if (!cookies) return []
    const enabled = loaded.state.categories
      .filter((category) => category.enabled)
      .map((category) => category.id)
    return await loadWinnerStreamRecipes({
      leagueId: loaded.espnLeagueId,
      season: loaded.state.season,
      cookies,
      players: loaded.state.players,
      enabledCats: enabled.length > 0 ? enabled : ALL_CATEGORY_IDS,
    })
  } catch {
    return []
  }
}

const loadMatchupDayActuals = async (input: {
  loaded: LoadedSeasonLeague
  userId: string
  opponentTeamIndex: number
  dates: string[]
  matchupDates: string[]
}): Promise<Map<string, DayActuals>> => {
  const { loaded } = input
  const oppTeam = loaded.state.teams.find(
    (team) => team.teamIndex === input.opponentTeamIndex,
  )
  const youTeamId = loaded.state.espnTeamId
  const oppTeamId = oppTeam?.espnTeamId
  if (!loaded.espnLeagueId || youTeamId == null || oppTeamId == null) {
    throw new Error("espn_team_ids_missing")
  }
  const cookies = await getUserEspnCookies(input.userId)
  if (!cookies) throw new Error("espn_cookies_missing")
  return fetchEspnDayActuals({
    leagueId: loaded.espnLeagueId,
    season: loaded.state.season,
    cookies,
    dates: input.dates,
    matchupDates: input.matchupDates,
    youTeamId,
    oppTeamId,
  })
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
        if (cell.droppedPlayerId) ids.add(cell.droppedPlayerId)
        if (cell.rosterDropPlayerId) ids.add(cell.rosterDropPlayerId)
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
  const rawWindow = params.get("statWindow")
  const statWindow = isStatWindow(rawWindow) ? rawWindow : "season"

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
  const winnerStreamRecipes = await loadMatchupWinnerRecipes(loaded, userId)
  const baseOptions = { winnerStreamRecipes, statWindow }
  const today = new Date().toISOString().slice(0, 10)
  const previous = morningCheckForOpponent(
    parseMorningCheck(loaded.morningCheckJson),
    schedule.matchup.startDate,
    opponentTeamIndex,
  )
  const morningFor = (actualsByDate: Map<string, DayActuals>) => ({
    today,
    actualsByDate,
    previous,
    outPlayerIds: [],
  })

  const loadMorningAdvice = async () => {
    if (loaded.state.source !== "espn") {
      return adviseMatchup(loaded.state, schedule, opponentTeamIndex, baseOptions)
    }
    if (previous?.checkedOn === today && !previous.actualsPending) {
      return adviseMatchup(loaded.state, schedule, opponentTeamIndex, {
        ...baseOptions,
        morning: morningFor(actualsFromClosedDays(previous.closedDays)),
      })
    }

    let actualsByDate: Map<string, DayActuals>
    try {
      actualsByDate = await loadMatchupDayActuals({
        loaded,
        userId,
        opponentTeamIndex,
        dates: schedule.matchup.days.filter((date) => date < today),
        matchupDates: schedule.matchup.days,
      })
    } catch {
      const fallback = previous
        ? adviseMatchup(loaded.state, schedule, opponentTeamIndex, {
            ...baseOptions,
            morning: morningFor(actualsFromClosedDays(previous.closedDays)),
          })
        : adviseMatchup(loaded.state, schedule, opponentTeamIndex, baseOptions)
      if ("error" in fallback) return fallback
      return { ...fallback, morningStale: true }
    }

    const blended = adviseMatchup(loaded.state, schedule, opponentTeamIndex, {
      ...baseOptions,
      morning: morningFor(actualsByDate),
    })
    if (!("error" in blended) && blended.nextMorningCheck) {
      await db.seasonLeague.update({
        where: { id: loaded.id },
        data: { morningCheckJson: JSON.stringify(blended.nextMorningCheck) },
      })
    }
    return blended
  }

  const advice = await loadMorningAdvice()

  if ("error" in advice) {
    return NextResponse.json({ error: advice.error }, { status: 400 })
  }

  let statPairs: StatPairRow[] = []
  try {
    statPairs = await loadStatPairs(loaded.state.players)
  } catch {
    statPairs = []
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
    statPairs,
    ...(includeState ? { state: loaded.state } : {}),
  })
}
