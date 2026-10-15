import type { SeasonLeagueState, SeasonTeamRoster } from "@/lib/season/types"
import { seasonTeamTotals, type TeamCategoryTotals } from "@/lib/season/analysis"
import { classifyTeam, teamsMatch } from "./classify"
import type { TradePackage, TradeShape } from "./types"

const tradablePlayerIds = (team: SeasonTeamRoster): string[] =>
  team.entries
    .flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId])
    .sort()

const combinationsOf = (playerIds: string[], size: number): string[][] => {
  if (size === 1) return playerIds.map((playerId) => [playerId])
  if (size === 2) {
    return playerIds.flatMap((playerId, index) =>
      playerIds.slice(index + 1).map((other) => [playerId, other]))
  }
  if (size !== 3) return []

  const triples: string[][] = []
  for (let first = 0; first < playerIds.length; first += 1) {
    for (let second = first + 1; second < playerIds.length; second += 1) {
      for (let third = second + 1; third < playerIds.length; third += 1) {
        triples.push([playerIds[first]!, playerIds[second]!, playerIds[third]!])
      }
    }
  }

  return triples
}

const shapeCounts = (shape: TradeShape) => {
  const [send, receive] = shape.split(":").map(Number)
  return { send, receive }
}

export const enumeratePackages = (
  state: SeasonLeagueState,
  totalsByTeam: TeamCategoryTotals[] = seasonTeamTotals(state),
  excludedPlayerIds: readonly string[] = [],
  shapes?: readonly TradeShape[],
): TradePackage[] => {
  const yourTeam = state.teams.find(
    ({ teamIndex }) => teamIndex === state.perspectiveTeamIndex,
  )

  if (!yourTeam) {
    return []
  }

  const excluded = new Set(excludedPlayerIds)
  const yourIds = tradablePlayerIds(yourTeam).filter((playerId) => !excluded.has(playerId))
  const yourSides = classifyTeam(totalsByTeam, state.perspectiveTeamIndex)
  const sized = (playerIds: string[], size: number | undefined) =>
    size
      ? combinationsOf(playerIds, size)
      : [...combinationsOf(playerIds, 1), ...combinationsOf(playerIds, 2)]

  const packagesFor = (send?: number, receive?: number): TradePackage[] => {
    const yourCombinations = sized(yourIds, send)

    return state.teams.flatMap((team) => {
      if (team.teamIndex === state.perspectiveTeamIndex) {
        return []
      }

      if (!teamsMatch(yourSides, classifyTeam(totalsByTeam, team.teamIndex))) {
        return []
      }

      const theirCombinations = sized(tradablePlayerIds(team), receive)

      return yourCombinations.flatMap((youPlayerIds) =>
        theirCombinations.map((themPlayerIds) => ({
          shape: `${youPlayerIds.length}:${themPlayerIds.length}` as TradeShape,
          counterpartyTeamIndex: team.teamIndex,
          youPlayerIds,
          themPlayerIds,
        })))
    })
  }

  if (!shapes?.length) {
    return packagesFor()
  }

  return [...new Set(shapes)].flatMap((shape) => {
    const { send, receive } = shapeCounts(shape)
    return packagesFor(send, receive)
  })
}
