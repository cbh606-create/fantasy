import type { CategoryId } from "@/lib/domain/types"

export type TradeShape = "1:1" | "2:1" | "1:2" | "2:2"

export type CategoryDelta = {
  categoryId: CategoryId
  rankBefore: number
  rankAfter: number
}

export type TradeSideImpact = {
  needsScoreBefore: number
  needsScoreAfter: number
  categoryDeltas: CategoryDelta[]
}

export type TradeSuggestion = {
  id: string
  shape: TradeShape
  counterpartyTeamIndex: number
  givePlayerIds: string[]
  getPlayerIds: string[]
  reasons: string[]
  mutualScore: number
  overpayRatio?: number
  you: TradeSideImpact
  them: TradeSideImpact
}

export type TradePackage = {
  shape: TradeShape
  counterpartyTeamIndex: number
  youPlayerIds: string[]
  themPlayerIds: string[]
}
