import type { SeasonLeagueState, SeasonTeamRoster } from "@/lib/season/types"
import { seasonTeamTotals, type TeamCategoryTotals } from "@/lib/season/analysis"
import { classifyTeam, teamsMatch } from "./classify"
import type { TradePackage, TradeShape } from "./types"

const tradablePlayerIds = (team: SeasonTeamRoster): string[] =>
  team.entries
    .flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId])
    .sort()

const combinations = (playerIds: string[]): string[][] => [
  ...playerIds.map((playerId) => [playerId]),
  ...playerIds.flatMap((playerId, index) =>
    playerIds.slice(index + 1).map((other) => [playerId, other])),
]

export const enumeratePackages = (
  state: SeasonLeagueState,
  totalsByTeam: TeamCategoryTotals[] = seasonTeamTotals(state),
  excludedPlayerIds: readonly string[] = [],
): TradePackage[] => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )

  if (!yourTeam) {
    return []
  }

  const excluded = new Set(excludedPlayerIds)
  const yourSides = classifyTeam(totalsByTeam, state.perspectiveTeamIndex)
  const yourCombinations = combinations(
    tradablePlayerIds(yourTeam).filter((playerId) => !excluded.has(playerId)),
  )

  return state.teams.flatMap((team) => {
    if (team.teamIndex === state.perspectiveTeamIndex) {
      return []
    }

    if (!teamsMatch(yourSides, classifyTeam(totalsByTeam, team.teamIndex))) {
      return []
    }

    const theirCombinations = combinations(tradablePlayerIds(team))

    return yourCombinations.flatMap((youPlayerIds) =>
      theirCombinations.map((themPlayerIds) => ({
        shape: `${youPlayerIds.length}:${themPlayerIds.length}` as TradeShape,
        counterpartyTeamIndex: team.teamIndex,
        youPlayerIds,
        themPlayerIds,
      })))
  })
}
