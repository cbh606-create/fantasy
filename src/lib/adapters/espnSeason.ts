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
