import type { CategoryId } from "@/lib/domain/types"
import type { CategoryTotalMove } from "./accept"

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
  valueGap?: number
  droppedPlayerId?: string
  youGains: CategoryTotalMove[]
  themGains: CategoryTotalMove[]
  youWorsened: CategoryTotalMove[]
  themWorsened: CategoryTotalMove[]
  youStrengthsHeld: CategoryId[]
  themStrengthsHeld: CategoryId[]
}

export type TradePackage = {
  shape: TradeShape
  counterpartyTeamIndex: number
  youPlayerIds: string[]
  themPlayerIds: string[]
}
