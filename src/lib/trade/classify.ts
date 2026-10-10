import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { TeamCategoryTotals } from "@/lib/season/analysis"

export type CategoryTotalMap = Record<CategoryId, number>

export type TeamCategorySides = {
  weak: CategoryId[]
  strong: CategoryId[]
}

const isGoodSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total < mean : total > mean

const isBadSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total > mean : total < mean

export const leagueMeans = (
  totalsByTeam: TeamCategoryTotals[],
): CategoryTotalMap =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => {
      const sum = totalsByTeam.reduce(
        (total, team) => total + team.totals[categoryId],
        0,
      )

      return [categoryId, sum / totalsByTeam.length]
    }),
  ) as CategoryTotalMap

export const classifyTeam = (
  totalsByTeam: TeamCategoryTotals[],
  teamIndex: number,
): TeamCategorySides => {
  const totals = totalsByTeam.find((team) => team.teamIndex === teamIndex)?.totals
  const weak: CategoryId[] = []
  const strong: CategoryId[] = []

  if (!totals) {
    return { weak, strong }
  }

  const means = leagueMeans(totalsByTeam)

  for (const categoryId of ALL_CATEGORY_IDS) {
    const total = totals[categoryId]
    const mean = means[categoryId]

    if (isBadSide(categoryId, total, mean)) weak.push(categoryId)
    if (isGoodSide(categoryId, total, mean)) strong.push(categoryId)
  }

  return { weak, strong }
}

export const teamsMatch = (
  you: TeamCategorySides,
  them: TeamCategorySides,
) =>
  you.weak.some((categoryId) => them.strong.includes(categoryId))
  && them.weak.some((categoryId) => you.strong.includes(categoryId))

export const matchedWeaks = (
  self: TeamCategorySides,
  other: TeamCategorySides,
) => self.weak.filter((categoryId) => other.strong.includes(categoryId))
