import type { InjuryStatus } from "@/lib/injuries/types"
import { STREAMING_PROTECTED_ADP_MAX } from "@/lib/matchup/constants"
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
