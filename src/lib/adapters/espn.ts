import espnLeagueFixture from "../../../data/fixtures/espn-league.json"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type { LeagueState, Player, RosterSlot } from "@/lib/domain/types"
import { EspnAdapterError, type EspnErrorCode } from "./errors"

const ESPN_ROSTER_SLOTS: RosterSlot[] = [
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
  "G",
  "F",
  "UTIL",
  "UTIL",
  "BE",
  "BE",
  "BE",
  "BE",
]

type EspnParams = {
  leagueId: string
  season: number
  swid?: string
  espnS2?: string
  forceFail?: EspnErrorCode
}

export const espnImportToLeagueState = async (
  params: EspnParams,
): Promise<LeagueState> => {
  if (params.forceFail) {
    throw new EspnAdapterError(params.forceFail)
  }

  if (process.env.ESPN_LIVE === "true") {
    throw new EspnAdapterError("ESPN_UNAVAILABLE")
  }

  const teams = 12 as const
  const board = buildEmptyBoard(teams, espnLeagueFixture.rounds)

  for (const fixturePick of espnLeagueFixture.picks) {
    const boardPick = board.picks.find(
      (pick) => pick.overall === fixturePick.overall,
    )

    if (boardPick) {
      boardPick.playerId = fixturePick.playerId
    }
  }

  const firstOpenPick = board.picks.find((pick) => pick.playerId === null)
  board.currentOverall = firstOpenPick?.overall ?? board.picks.length + 1

  return {
    settings: {
      teams,
      draftType: "snake",
      rosterSlots: ESPN_ROSTER_SLOTS,
      categories: defaultCategorySettings(),
      userPickSlot: espnLeagueFixture.userPickSlot,
      puntCategoryIds: [],
      focusCategoryIds: [],
      rounds: espnLeagueFixture.rounds,
    },
    board,
    players: espnLeagueFixture.players as Player[],
    source: "espn",
    perspectiveTeamIndex: espnLeagueFixture.userPickSlot - 1,
  }
}

export const espnSyncBoard = async (
  state: LeagueState,
  params: EspnParams,
): Promise<{ state: LeagueState; conflicts: number[] }> => {
  const espnState = await espnImportToLeagueState(params)
  const conflicts: number[] = []
  const picks = state.board.picks.map((localPick) => {
    const espnPick = espnState.board.picks.find(
      (pick) => pick.overall === localPick.overall,
    )

    if (!espnPick?.playerId) return { ...localPick }
    if (!localPick.playerId) {
      return { ...localPick, playerId: espnPick.playerId }
    }
    if (localPick.playerId === espnPick.playerId) return { ...localPick }

    conflicts.push(localPick.overall)
    return { ...localPick }
  })
  const firstOpenPick = picks.find((pick) => pick.playerId === null)

  return {
    state: {
      ...state,
      board: {
        picks,
        currentOverall: firstOpenPick?.overall ?? picks.length + 1,
      },
      source: conflicts.length > 0 ? "mixed" : "espn",
    },
    conflicts,
  }
}
