import espnSeasonLeagueFixture from "../../../data/fixtures/espn-season-league.json"
import { manualToSeasonLeagueState } from "./manualSeason"
import { EspnAdapterError, type EspnErrorCode } from "./errors"
import type {
  SeasonLeagueState,
  SeasonRosterEntry,
  SeasonSlot,
} from "@/lib/season/types"

type EspnSeasonParams = {
  leagueId: string
  season: number
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
  params: EspnSeasonParams,
): Promise<SeasonLeagueState> => {
  if (params.forceFail) {
    throw new EspnAdapterError(params.forceFail)
  }

  if (process.env.ESPN_LIVE === "true") {
    throw new EspnAdapterError("ESPN_UNAVAILABLE")
  }

  return {
    ...manualToSeasonLeagueState(espnSeasonLeagueFixture),
    id: params.leagueId,
    source: "espn",
  }
}
