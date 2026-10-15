import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { rosterPlayers, teamTotals } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { buildPlayerValueMap } from "@/lib/trade/value"
export type TradeStatSide = "you" | "them"

export type TradeStatRow = {
  id: string
  label: string
  side: TradeStatSide
  emphasis: boolean
  signed: boolean
  value: number | null
  values: Record<CategoryId, number>
}

export type TradeStatInput = {
  counterpartyTeamIndex: number
  givePlayerIds: string[]
  getPlayerIds: string[]
  droppedPlayerId?: string
  addedPlayerId?: string
}

const emptyLine = (): Record<CategoryId, number> =>
  Object.fromEntries(ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0])) as Record<CategoryId, number>

const lineFromPlayers = (players: SeasonPlayer[]): Record<CategoryId, number> => {
  if (!players.length) return emptyLine()
  return teamTotals(players)
}

const subtractLine = (
  after: Record<CategoryId, number>,
  before: Record<CategoryId, number>,
): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, after[categoryId] - before[categoryId]]),
  ) as Record<CategoryId, number>

const rosterOf = (
  state: SeasonLeagueState,
  teamIndex: number,
  playersById: Map<string, SeasonPlayer>,
) => {
  const team = state.teams.find((entry) => entry.teamIndex === teamIndex)
  if (!team) return []
  return rosterPlayers(team, playersById)
}

const playersFor = (ids: string[], playersById: Map<string, SeasonPlayer>) =>
  ids.flatMap((id) => {
    const player = playersById.get(id)
    return player ? [player] : []
  })

export const tradeStatRows = (
  state: SeasonLeagueState,
  suggestion: TradeStatInput,
): TradeStatRow[] => {
  const playersById = new Map(state.players.map((player) => [player.id, player]))
  const playerValues = buildPlayerValueMap(state)
  const givePlayers = playersFor(suggestion.givePlayerIds, playersById)
  const getPlayers = playersFor(suggestion.getPlayerIds, playersById)
  const packageValue = (players: SeasonPlayer[]) =>
    players.reduce((sum, player) => sum + (playerValues.get(player.id) ?? 0), 0)
  const yourRoster = rosterOf(state, state.perspectiveTeamIndex, playersById)
  const added = suggestion.addedPlayerId
    ? playersById.get(suggestion.addedPlayerId) ?? null
    : null
  const dropped = suggestion.droppedPlayerId
    ? playersById.get(suggestion.droppedPlayerId) ?? null
    : null
  const yourDropIds = dropped && yourRoster.some((player) => player.id === dropped.id)
    ? [dropped.id]
    : []
  const without = (players: SeasonPlayer[], ids: string[]) => {
    const removed = new Set(ids)
    return players.filter((player) => !removed.has(player.id))
  }
  const yourAfter = [
    ...without(yourRoster, [...suggestion.givePlayerIds, ...yourDropIds]),
    ...getPlayers,
    ...(added ? [added] : []),
  ]

  return [
    ...givePlayers.map((player) => ({
      id: `send-${player.id}`,
      label: player.name,
      side: "you" as const,
      emphasis: false,
      signed: false,
      value: playerValues.get(player.id) ?? 0,
      values: lineFromPlayers([player]),
    })),
    ...getPlayers.map((player) => ({
      id: `receive-${player.id}`,
      label: player.name,
      side: "them" as const,
      emphasis: false,
      signed: false,
      value: playerValues.get(player.id) ?? 0,
      values: lineFromPlayers([player]),
    })),
    {
      id: "send-total",
      label: "Send total",
      side: "you",
      emphasis: true,
      signed: false,
      value: packageValue(givePlayers),
      values: lineFromPlayers(givePlayers),
    },
    {
      id: "receive-total",
      label: "Receive total",
      side: "them",
      emphasis: true,
      signed: false,
      value: packageValue(getPlayers),
      values: lineFromPlayers(getPlayers),
    },
    {
      id: "you-delta",
      label: "Difference",
      side: "you",
      emphasis: true,
      signed: true,
      value: packageValue(getPlayers) - packageValue(givePlayers),
      values: subtractLine(lineFromPlayers(yourAfter), lineFromPlayers(yourRoster)),
    },
  ]
}
