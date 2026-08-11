import type { CategoryId } from "@/lib/domain/types"
import type { SeasonAnalysis } from "@/lib/season/analysis"
import type { SeasonLeagueState, SeasonTeamRoster } from "@/lib/season/types"
import { MAX_CANDIDATES_PER_TEAM } from "./constants"
import { teamNeedsAndSurplus } from "./needs"
import type { TradePackage, TradeShape } from "./types"
import { buildPlayerValueMap } from "./value"

type TeamProfile = { need: CategoryId[]; surplus: CategoryId[] }

const hasComplementaryNeeds = (you: TeamProfile, them: TeamProfile) =>
  you.need.some((categoryId) => them.surplus.includes(categoryId))
  && them.need.some((categoryId) => you.surplus.includes(categoryId))

const candidatePlayerIds = (
  team: SeasonTeamRoster,
  values: Map<string, number>,
): string[] =>
  team.entries
    .flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId])
    .sort((left, right) => (values.get(right) ?? 0) - (values.get(left) ?? 0))
    .slice(0, MAX_CANDIDATES_PER_TEAM)

const combinations = (playerIds: string[]): string[][] => [
  ...playerIds.map((playerId) => [playerId]),
  ...playerIds.flatMap((playerId, index) =>
    playerIds.slice(index + 1).map((other) => [playerId, other])),
]

export const enumeratePackages = (
  state: SeasonLeagueState,
  analysis: SeasonAnalysis,
): TradePackage[] => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )

  if (!yourTeam) {
    return []
  }

  const values = buildPlayerValueMap(state)
  const yourProfile = teamNeedsAndSurplus(analysis, state.perspectiveTeamIndex)
  const yourCombinations = combinations(candidatePlayerIds(yourTeam, values))

  return state.teams.flatMap((team) => {
    if (team.teamIndex === state.perspectiveTeamIndex) {
      return []
    }

    const theirProfile = teamNeedsAndSurplus(analysis, team.teamIndex)

    if (!hasComplementaryNeeds(yourProfile, theirProfile)) {
      return []
    }

    const theirCombinations = combinations(candidatePlayerIds(team, values))

    return yourCombinations.flatMap((youPlayerIds) =>
      theirCombinations.map((themPlayerIds) => ({
        shape:
          `${youPlayerIds.length}:${themPlayerIds.length}` as TradeShape,
        counterpartyTeamIndex: team.teamIndex,
        youPlayerIds,
        themPlayerIds,
      })))
  })
}
