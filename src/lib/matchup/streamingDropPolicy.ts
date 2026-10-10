import type { InjuryStatus } from "@/lib/injuries/types"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { STREAMING_PROTECTED_ADP_MAX } from "@/lib/matchup/constants"
import { categoryWinProb } from "@/lib/matchup/board"
import { weeklyPlayerStats } from "@/lib/matchup/weekly"
import type { MatchupBoard, StatWindow } from "@/lib/matchup/types"
import type { SeasonPlayer } from "@/lib/season/types"

type ExpectedOutDaysInput = {
  status: InjuryStatus
  expectedOutDays?: number
}

type IlVersusNewInjuredPlayer = {
  playerId: string
  adp: number | null
  outDays: number
}

type ChooseIlVersusNewInjuredDropInput = {
  il: IlVersusNewInjuredPlayer | null
  newlyInjured: IlVersusNewInjuredPlayer | null
}

export const resolveExpectedOutDays = ({
  status,
  expectedOutDays,
}: ExpectedOutDaysInput): number => {
  if (expectedOutDays != null) return expectedOutDays
  return status === "out" ? 21 : 3
}

export const isLongTermInjuryException = (outDays: number): boolean =>
  outDays >= 14

export const isUnderperformingDropException = (_player: SeasonPlayer): boolean =>
  false

export const isAdpProtected = (adp: number | null | undefined): boolean =>
  adp != null && adp <= STREAMING_PROTECTED_ADP_MAX

const TEAM_FGA_PER_GAME = 80
const TEAM_FTA_PER_GAME = 20

const neutralYou = (categoryId: CategoryId) => {
  if (categoryId === "FG_PCT") return 0.47
  if (categoryId === "FT_PCT") return 0.78
  return 0
}

const neutralBoard = (): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => {
    const you = neutralYou(categoryId)
    return {
      categoryId,
      you,
      opp: you,
      outcome: "T" as const,
      winProb: 0.5,
    }
  }),
  wins: 0,
  losses: 0,
  ties: ALL_CATEGORY_IDS.length,
  projectedCatWins: ALL_CATEGORY_IDS.length * 0.5,
})

const blendedRate = (
  teamRate: number,
  playerRate: number,
  playerAttempts: number,
  teamAttempts: number,
) => {
  const total = teamAttempts + playerAttempts
  if (total <= 0) return teamRate
  return (teamRate * teamAttempts + playerRate * playerAttempts) / total
}

/** Marginal matchup expected category wins from adding this player's games. */
export const expectedWinsAdded = (
  player: SeasonPlayer,
  games: number,
  board?: MatchupBoard,
  window: StatWindow = "season",
): number => {
  const weekly = weeklyPlayerStats(player, games, window)
  const rows = (board ?? neutralBoard()).categories
  const attemptGames = Math.max(games, 1)
  let delta = 0
  for (const row of rows) {
    const before = categoryWinProb(row.you, row.opp, row.categoryId)
    let nextYou = row.you
    if (row.categoryId === "FG_PCT") {
      nextYou = blendedRate(
        row.you,
        weekly.projections.FG_PCT,
        weekly.shooting.FGA,
        TEAM_FGA_PER_GAME * attemptGames,
      )
    } else if (row.categoryId === "FT_PCT") {
      nextYou = blendedRate(
        row.you,
        weekly.projections.FT_PCT,
        weekly.shooting.FTA,
        TEAM_FTA_PER_GAME * attemptGames,
      )
    } else {
      nextYou = row.you + (weekly.projections[row.categoryId] ?? 0)
    }
    delta += categoryWinProb(nextYou, row.opp, row.categoryId) - before
  }
  return delta
}

const adpDropRank = (adp: number | null | undefined) =>
  adp == null ? Number.POSITIVE_INFINITY : adp

export const compareDropPriority = (
  left: { games: number; expectedWins: number; adp: number | null | undefined },
  right: { games: number; expectedWins: number; adp: number | null | undefined },
): number => {
  if (left.games !== right.games) return left.games - right.games
  if (left.expectedWins !== right.expectedWins) {
    return left.expectedWins - right.expectedWins
  }
  return adpDropRank(right.adp) - adpDropRank(left.adp)
}

export const compareAddTiebreak = (
  left: { expectedWins: number; adp: number | null | undefined },
  right: { expectedWins: number; adp: number | null | undefined },
): number => {
  const adpDelta = adpDropRank(left.adp) - adpDropRank(right.adp)
  if (adpDelta !== 0) return adpDelta
  return right.expectedWins - left.expectedWins
}

type ProjAdpPlayer = {
  id: string
  name: string
  teamAbbr?: string
  adp?: number
}

const ESPN_ID_PREFIX = "espn-"
const isDigitsOnlyId = (id: string) => /^\d+$/.test(id)

const nameTeamKey = (name: string, teamAbbr?: string) =>
  `${name}|${(teamAbbr ?? "").toUpperCase()}`

const resolveAdpFromId = (
  playerId: string,
  byId: Map<string, number>,
): number | undefined => {
  const exact = byId.get(playerId)
  if (exact != null) return exact
  if (isDigitsOnlyId(playerId)) return byId.get(`${ESPN_ID_PREFIX}${playerId}`)
  if (playerId.startsWith(ESPN_ID_PREFIX)) {
    const bare = playerId.slice(ESPN_ID_PREFIX.length)
    if (isDigitsOnlyId(bare)) return byId.get(bare)
  }
  return undefined
}

export const buildAdpByPlayerIdFromProjPool = (
  players: SeasonPlayer[],
  projPlayers: readonly ProjAdpPlayer[] = [],
): Record<string, number> => {
  const byId = new Map<string, number>()
  const byNameTeam = new Map<string, number>()
  for (const row of projPlayers) {
    if (row.adp == null) continue
    byId.set(row.id, row.adp)
    const key = nameTeamKey(row.name, row.teamAbbr)
    if (!byNameTeam.has(key)) byNameTeam.set(key, row.adp)
  }

  const adpByPlayerId: Record<string, number> = {}
  for (const player of players) {
    const fromId = resolveAdpFromId(player.id, byId)
    if (fromId != null) {
      adpByPlayerId[player.id] = fromId
      continue
    }
    const fromName = byNameTeam.get(nameTeamKey(player.name, player.teamAbbr))
    if (fromName != null) adpByPlayerId[player.id] = fromName
  }
  return adpByPlayerId
}

export const chooseIlVersusNewInjuredDrop = ({
  il,
  newlyInjured,
}: ChooseIlVersusNewInjuredDropInput): string | null => {
  if (!il && !newlyInjured) return null
  if (!il) return newlyInjured!.playerId
  if (!newlyInjured) return il.playerId

  if (newlyInjured.outDays !== il.outDays) {
    return newlyInjured.outDays > il.outDays
      ? newlyInjured.playerId
      : il.playerId
  }

  const ilAdp = il.adp ?? Number.POSITIVE_INFINITY
  const newAdp = newlyInjured.adp ?? Number.POSITIVE_INFINITY
  return newAdp > ilAdp ? newlyInjured.playerId : il.playerId
}
