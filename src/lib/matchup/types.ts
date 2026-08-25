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

export type SitStartSuggestion = {
  benchPlayerId: string
  activePlayerId: string
  deltaProjectedCatWins: number
  reason: string
}

export type SitStartSwap = {
  benchPlayerId: string
  activePlayerId: string
}

export type StreamerSuggestion = {
  playerId: string
  score: number
  gamesThisWeek: number
  b2bNights: number
  reasons: string[]
}

export type StreamingStrategyMode =
  | "aggressive"
  | "balanced"
  | "conservative"

export type StreamingDensityTier = "elite" | "strong" | "ok" | "thin"

export type StreamingPlanSpotCount = 1 | 2 | 3

export type StreamingPlanAction = "hold" | "add" | "drop_add" | "empty"

export type StreamingPlanRosterDropKind = "player" | "open_slot" | "none"

export type StreamingPlanDayCell = {
  spotIndex: number
  playerId: string | null
  action: StreamingPlanAction
  droppedPlayerId: string | null
  rosterDropPlayerId: string | null
  rosterDropKind: StreamingPlanRosterDropKind
}

export type StreamingPlanDay = {
  date: string
  cells: StreamingPlanDayCell[]
}

export type StreamingPlan = {
  spotCount: StreamingPlanSpotCount
  addLimit: number
  addsUsed: number
  gameStarts: number
  strategyMode: StreamingStrategyMode
  suggestedStrategyMode: StreamingStrategyMode
  summaryReasons: string[]
  days: StreamingPlanDay[]
}

export type MatchupAdvice = {
  opponentTeamIndex: number
  scoringPeriod: {
    scoringPeriodId: number
    startDate: string
    endDate: string
    days: string[]
  }
  board: MatchupBoard
  sitStart: SitStartSuggestion[]
  streamers: StreamerSuggestion[]
  streamingPlans: StreamingPlan[]
  adpByPlayerId?: Record<string, number>
}
