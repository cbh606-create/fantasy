import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague, type SeasonAnalysis } from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { needsScore, teamNeedsAndSurplus } from "@/lib/trade/needs"
import { applyAddDrop } from "./apply"
import { youWaiverRank } from "./rank"
import type { AddDropError, AddDropInput, AddDropPreview } from "./types"

const categoryRank = (
  analysis: SeasonAnalysis,
  teamIndex: number,
  categoryId: CategoryId,
): number =>
  analysis.byCategory
    .find((category) => category.categoryId === categoryId)
    ?.rows.find((row) => row.teamIndex === teamIndex)
    ?.rank ?? 0

export const previewAddDrop = (
  state: SeasonLeagueState,
  input: AddDropInput,
): AddDropPreview | AddDropError => {
  const before = analyzeSeasonLeague(state)
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

  const after = analyzeSeasonLeague(applied)

  return {
    youWaiverRank: rank,
    requiresAssumeSuccess,
    before: {
      needsScore: needsScore(before, youIndex, needCategories),
    },
    after: {
      needsScore: needsScore(after, youIndex, needCategories),
    },
    categoryDeltas: ALL_CATEGORY_IDS.map((categoryId) => ({
      categoryId,
      rankBefore: categoryRank(before, youIndex, categoryId),
      rankAfter: categoryRank(after, youIndex, categoryId),
    })),
  }
}
