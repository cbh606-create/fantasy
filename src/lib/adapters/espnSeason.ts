import espnSeasonLeagueFixture from "../../../data/fixtures/espn-season-league.json"
import {
  manualToSeasonLeagueState,
  type ManualSeasonLeagueInput,
} from "./manualSeason"
import { EspnAdapterError, type EspnErrorCode } from "./errors"
import { fetchEspnSeasonLeague } from "./espnSeasonLive"
import type { EspnCookies } from "@/lib/espn/cookies"
import type {
  SeasonLeagueState,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

type EspnSeasonParams = {
  leagueId: string
  season: number
  teamId?: number
  cookies?: EspnCookies
  forceFail?: EspnErrorCode
}

const lineupPlayerIdsBySlot = (entries: SeasonRosterEntry[]) =>
  entries.reduce<Record<SeasonSlot, Array<string | null>>>(
    (playerIdsBySlot, entry) => {
      playerIdsBySlot[entry.slot].push(entry.playerId)
      return playerIdsBySlot
    },
    {
      PG: [],
      SG: [],
      SF: [],
      PF: [],
      C: [],
      G: [],
      F: [],
      UTIL: [],
      BE: [],
      IL: [],
    },
  )

export const detectLineupConflict = (
  snapshotEntries: SeasonRosterEntry[],
  localLineup: SeasonRosterEntry[],
): boolean => {
  const snapshotPlayerIdsBySlot = lineupPlayerIdsBySlot(snapshotEntries)
  const localPlayerIdsBySlot = lineupPlayerIdsBySlot(localLineup)

  return (Object.keys(snapshotPlayerIdsBySlot) as SeasonSlot[]).some((slot) => {
    const snapshotPlayerIds = snapshotPlayerIdsBySlot[slot].toSorted()
    const localPlayerIds = localPlayerIdsBySlot[slot].toSorted()

    return (
      snapshotPlayerIds.length !== localPlayerIds.length ||
      snapshotPlayerIds.some(
        (playerId, index) => playerId !== localPlayerIds[index],
      )
    )
  })
}

const perspectiveRosterCount = (state: SeasonLeagueState): number => {
  const you = state.teams.find(
    (team) => team.teamIndex === state.perspectiveTeamIndex,
  )
  return you?.entries.filter((entry) => Boolean(entry.playerId)).length ?? 0
}

/** Prefer season+1 when that year already has a drafted perspective roster. */
export const pickPreferringNewerSeason = (
  current: SeasonLeagueState,
  newer: SeasonLeagueState | null,
): SeasonLeagueState => {
  if (newer && perspectiveRosterCount(newer) > 0) {
    return newer
  }
  return current
}

export const espnImportToSeasonLeagueState = async (
  params: EspnSeasonParams & { forbidFixture?: boolean },
): Promise<SeasonLeagueState> => {
  if (params.forceFail) {
    throw new EspnAdapterError(params.forceFail)
  }

  const useLive =
    Boolean(params.cookies) || process.env.ESPN_LIVE === "true"

  if (useLive) {
    if (
      typeof params.teamId !== "number" ||
      !Number.isInteger(params.teamId)
    ) {
      throw new EspnAdapterError("ESPN_PARTIAL")
    }

    return fetchEspnSeasonLeague({
      leagueId: params.leagueId,
      season: params.season,
      teamId: params.teamId,
      cookies: params.cookies,
    })
  }

  if (params.forbidFixture) {
    throw new EspnAdapterError(
      "ESPN_NO_CREDENTIALS",
      "Connect ESPN cookies before refreshing a live league",
    )
  }

  return {
    ...manualToSeasonLeagueState(
      espnSeasonLeagueFixture as ManualSeasonLeagueInput,
    ),
    id: params.leagueId,
    source: "espn",
    espnTeamId: params.teamId,
  }
}

/**
 * Prefer the newer ESPN season year when that year already has a drafted roster.
 * Keeps the stored year when season+1 is empty (pre-draft) or unavailable.
 */
export const espnImportPreferringNewerSeason = async (
  params: EspnSeasonParams & { forbidFixture?: boolean },
): Promise<SeasonLeagueState> => {
  const current = await espnImportToSeasonLeagueState(params)

  let newer: SeasonLeagueState | null = null
  try {
    newer = await espnImportToSeasonLeagueState({
      ...params,
      season: params.season + 1,
    })
  } catch {
    newer = null
  }

  return pickPreferringNewerSeason(current, newer)
}
