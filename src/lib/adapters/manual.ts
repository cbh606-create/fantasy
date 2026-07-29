import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type { LeagueSettings, LeagueState, RosterSlot } from "@/lib/domain/types"
import type { ManualLeagueInput } from "./types"

const DEFAULT_ROSTER_SLOTS: RosterSlot[] = [
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

export const manualToLeagueState = (input: ManualLeagueInput): LeagueState => {
  const rounds = input.rounds
  const teams = 12 as const

  const settings: LeagueSettings = {
    teams,
    draftType: "snake",
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    categories: input.categories ?? defaultCategorySettings(),
    userPickSlot: input.userPickSlot,
    puntCategoryIds: input.puntCategoryIds ?? [],
    focusCategoryIds: input.focusCategoryIds ?? [],
    rounds,
  }

  const board = buildEmptyBoard(teams, rounds)

  if (input.picks) {
    for (const pick of input.picks) {
      const boardPick = board.picks.find((entry) => entry.overall === pick.overall)

      if (boardPick) {
        boardPick.playerId = pick.playerId
      }
    }
  }

  const firstOpenPick = board.picks.find((entry) => !entry.playerId)
  board.currentOverall = firstOpenPick?.overall ?? board.picks.length + 1

  return {
    settings,
    board,
    players: input.players,
    source: "manual",
    perspectiveTeamIndex: input.userPickSlot - 1,
  }
}
