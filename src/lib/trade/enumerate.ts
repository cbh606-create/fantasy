import type { SeasonLeagueState, SeasonTeamRoster } from "@/lib/season/types"
import { seasonTeamTotals } from "@/lib/season/analysis"
import {
  classifyTeam,
  matchedWeaks,
  teamsMatch,
  type TeamCategorySides,
} from "./classify"
import type { TradePackage, TradeShape } from "./types"

const tradablePlayerIds = (team: SeasonTeamRoster): string[] =>
  team.entries
    .flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId])
    .sort()

const tradePartnerMatch = (you: TeamCategorySides, them: TeamCategorySides) => {
  if (!teamsMatch(you, them)) {
    return false
  }

  const youReceive = matchedWeaks(you, them)
  const themReceive = matchedWeaks(them, you)

  return (
    youReceive.length > 0
    && themReceive.length > 0
    && !youReceive.some((categoryId) => themReceive.includes(categoryId))
    && !you.weak.some((categoryId) => them.weak.includes(categoryId))
    && !you.strong.some((categoryId) => them.strong.includes(categoryId))
  )
}

const combinations = (playerIds: string[]): string[][] => [
  ...playerIds.map((playerId) => [playerId]),
  ...playerIds.flatMap((playerId, index) =>
    playerIds.slice(index + 1).map((other) => [playerId, other])),
]

export const enumeratePackages = (
  state: SeasonLeagueState,
): TradePackage[] => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )

  if (!yourTeam) {
    return []
  }

  const totalsByTeam = seasonTeamTotals(state)
  const yourSides = classifyTeam(totalsByTeam, state.perspectiveTeamIndex)
  const yourCombinations = combinations(tradablePlayerIds(yourTeam))

  return state.teams.flatMap((team) => {
    if (team.teamIndex === state.perspectiveTeamIndex) {
      return []
    }

    const theirSides = classifyTeam(totalsByTeam, team.teamIndex)

    if (!tradePartnerMatch(yourSides, theirSides)) {
      return []
    }

    return yourCombinations.flatMap((youPlayerIds) =>
      combinations(tradablePlayerIds(team)).map((themPlayerIds) => ({
        shape: `${youPlayerIds.length}:${themPlayerIds.length}` as TradeShape,
        counterpartyTeamIndex: team.teamIndex,
        youPlayerIds,
        themPlayerIds,
      })))
  })
}
