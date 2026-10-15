import type { CategoryDelta } from "@/lib/trade/types"

export type AddDropCategoryDelta = CategoryDelta & {
  beforeTotal: number
  afterTotal: number
}

export type AddDropInput = {
  addPlayerId: string
  dropPlayerId: string | null
}

export type AddDropError = {
  error: string
}

export type PickupRecommendation = {
  playerId: string
  score: number
  reasons: string[]
}

export type AddDropPreview = {
  youWaiverRank: number
  requiresAssumeSuccess: boolean
  before: {
    needsScore: number
  }
  after: {
    needsScore: number
  }
  overall: {
    rankBefore: number
    rankAfter: number
    rankSumBefore: number
    rankSumAfter: number
  }
  categoryDeltas: AddDropCategoryDelta[]
}
