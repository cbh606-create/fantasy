import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import {
  analyzePerGameLeague,
  analyzeSeasonLeague,
  type SeasonAnalysis,
  type StatBasis,
} from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { needsScore, teamNeedsAndSurplus } from "@/lib/trade/needs"
import { applyAddDrop } from "./apply"
import { youWaiverRank } from "./rank"
import type { AddDropError, AddDropInput, AddDropPreview } from "./types"

const overallPlace = (analysis: SeasonAnalysis, teamIndex: number) => {
  const row = analysis.overall.rows.find((candidate) => candidate.teamIndex === teamIndex)

  return {
    rank: row?.rank ?? 0,
    rankSum: row?.rankSum ?? 0,
  }
}

const categoryRow = (
  analysis: SeasonAnalysis,
  teamIndex: number,
  categoryId: CategoryId,
) =>
  analysis.byCategory
    .find((category) => category.categoryId === categoryId)
    ?.rows.find((row) => row.teamIndex === teamIndex)

export const previewAddDrop = (
  state: SeasonLeagueState,
  input: AddDropInput,
  basis: StatBasis = "total",
): AddDropPreview | AddDropError => {
  const analyze = basis === "perGame" ? analyzePerGameLeague : analyzeSeasonLeague
  const before = analyze(state)
  const youIndex = state.perspectiveTeamIndex
  const needCategories = teamNeedsAndSurplus(before, youIndex).need
  const rank = youWaiverRank(state)
  const addPlayer = state.players.find((player) => player.id === input.addPlayerId)
  const requiresAssumeSuccess =
    addPlayer?.availability === "waiver" && rank > 1
  const applied = applyAddDrop(state, input)

  if ("error" in applied) {
    return applied
  }

  const after = analyze(applied)
  const beforeOverall = overallPlace(before, youIndex)
  const afterOverall = overallPlace(after, youIndex)

  return {
    youWaiverRank: rank,
    requiresAssumeSuccess,
    before: {
      needsScore: needsScore(before, youIndex, needCategories),
    },
    after: {
      needsScore: needsScore(after, youIndex, needCategories),
    },
    overall: {
      rankBefore: beforeOverall.rank,
      rankAfter: afterOverall.rank,
      rankSumBefore: beforeOverall.rankSum,
      rankSumAfter: afterOverall.rankSum,
    },
    categoryDeltas: ALL_CATEGORY_IDS.map((categoryId) => {
      const beforeRow = categoryRow(before, youIndex, categoryId)
      const afterRow = categoryRow(after, youIndex, categoryId)

      return {
        categoryId,
        rankBefore: beforeRow?.rank ?? 0,
        rankAfter: afterRow?.rank ?? 0,
        beforeTotal: beforeRow?.raw ?? 0,
        afterTotal: afterRow?.raw ?? 0,
      }
    }),
  }
}
