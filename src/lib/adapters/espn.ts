import espnLeagueFixture from "../../../data/fixtures/espn-league.json"
import { defaultCategorySettings } from "@/lib/domain/categories"
import {
  DEFAULT_TEAMS,
  ESPN_MAX_TEAMS,
  ESPN_MIN_TEAMS,
} from "@/lib/domain/leagueSize"
import {
  buildEmptyBoard,
  DEFAULT_DRAFT_ROUNDS,
} from "@/lib/domain/snake"
import type {
  CategoryId,
  CategorySetting,
  LeagueState,
  Player,
  RosterSlot,
} from "@/lib/domain/types"
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

const clampTeams = (value: number): number =>
  Math.min(ESPN_MAX_TEAMS, Math.max(ESPN_MIN_TEAMS, Math.trunc(value)))

type EspnParams = {
  leagueId: string
  season: number
  swid?: string
  espnS2?: string
  forceFail?: EspnErrorCode
  /** Fixture / practice override until live ESPN size mapping ships. */
  teams?: number
  userPickSlot?: number
  categories?: CategorySetting[]
  puntCategoryIds?: CategoryId[]
  focusCategoryIds?: CategoryId[]
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

  const fixtureTeams =
    "teams" in espnLeagueFixture &&
    typeof espnLeagueFixture.teams === "number"
      ? espnLeagueFixture.teams
      : DEFAULT_TEAMS
  const teams = clampTeams(params.teams ?? fixtureTeams)
  const rounds =
    typeof espnLeagueFixture.rounds === "number"
      ? espnLeagueFixture.rounds
      : DEFAULT_DRAFT_ROUNDS
  const requestedSlot =
    params.userPickSlot ?? espnLeagueFixture.userPickSlot
  const userPickSlot = Math.min(teams, Math.max(1, Math.trunc(requestedSlot)))
  const board = buildEmptyBoard(teams, rounds)

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
      categories: params.categories ?? defaultCategorySettings(),
      userPickSlot,
      puntCategoryIds: params.puntCategoryIds ?? [],
      focusCategoryIds: params.focusCategoryIds ?? [],
      rounds,
    },
    board,
    players: espnLeagueFixture.players as Player[],
    source: "espn",
    perspectiveTeamIndex: userPickSlot - 1,
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
