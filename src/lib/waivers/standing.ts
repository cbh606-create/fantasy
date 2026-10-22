import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import {
  analyzeTeamTotals,
  leagueTotalsForBasis,
  type SeasonAnalysis,
  type StatBasis,
} from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"

export type TeamStanding = {
  overallRank: number
  rankSum: number
  categories: {
    categoryId: CategoryId
    rank: number
    total: number
  }[]
}

export const analyzeForBasis = (
  state: SeasonLeagueState,
  basis: StatBasis,
): SeasonAnalysis => analyzeTeamTotals(leagueTotalsForBasis(state, basis))

export const teamStanding = (
  state: SeasonLeagueState,
  basis: StatBasis = "total",
): TeamStanding => {
  const analysis = analyzeForBasis(state, basis)
  const teamIndex = state.perspectiveTeamIndex
  const overall = analysis.overall.rows.find((row) => row.teamIndex === teamIndex)

  return {
    overallRank: overall?.rank ?? 0,
    rankSum: overall?.rankSum ?? 0,
    categories: ALL_CATEGORY_IDS.map((categoryId) => {
      const row = analysis.byCategory
        .find((category) => category.categoryId === categoryId)
        ?.rows.find((candidate) => candidate.teamIndex === teamIndex)

      return {
        categoryId,
        rank: row?.rank ?? 0,
        total: row?.raw ?? 0,
      }
    }),
  }
}
