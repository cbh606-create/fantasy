import type { CategoryDelta } from "@/lib/trade/types"

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
  categoryDeltas: CategoryDelta[]
}
