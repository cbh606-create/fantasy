import type { CategoryId } from "@/lib/domain/types"

export type CategoryOutcome = "W" | "L" | "T"

export type MatchupCategoryRow = {
  categoryId: CategoryId
  you: number
  opp: number
  outcome: CategoryOutcome
  winProb: number
}

export type MatchupBoard = {
  categories: MatchupCategoryRow[]
  wins: number
  losses: number
  ties: number
  projectedCatWins: number
}

export type WeeklyShooting = {
  FGM: number
  FGA: number
  FTM: number
  FTA: number
}

export type WeeklyPlayerStats = {
  projections: Record<CategoryId, number>
  shooting: WeeklyShooting
}
