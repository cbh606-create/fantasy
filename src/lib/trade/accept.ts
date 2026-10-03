import type { CategoryId } from "@/lib/domain/types"
import type { CategoryTotalMap } from "./classify"

export type { CategoryTotalMap }

export type CategoryTotalMove = {
  categoryId: CategoryId
  before: number
  after: number
}

export type SideAssessment = {
  gains: CategoryTotalMove[]
  worsened: CategoryTotalMove[]
  strengthsHeld: CategoryId[]
  improved: boolean
  strengthsIntact: boolean
}

const movedGood = (categoryId: CategoryId, before: number, after: number) =>
  categoryId === "TO" ? after < before : after > before

const onGoodSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total < mean : total > mean

const onBadSide = (categoryId: CategoryId, total: number, mean: number) =>
  categoryId === "TO" ? total > mean : total < mean

export const assessSide = ({
  before,
  after,
  beforeMean,
  afterMean,
  weak,
  strong,
  matchedWeak,
}: {
  before: CategoryTotalMap
  after: CategoryTotalMap
  beforeMean: CategoryTotalMap
  afterMean: CategoryTotalMap
  weak: CategoryId[]
  strong: CategoryId[]
  matchedWeak: CategoryId[]
}): SideAssessment => {
  const gains = matchedWeak
    .filter((categoryId) =>
      movedGood(categoryId, before[categoryId], after[categoryId]))
    .map((categoryId) => ({
      categoryId,
      before: before[categoryId],
      after: after[categoryId],
    }))
  const worsened = weak
    .filter((categoryId) =>
      !movedGood(categoryId, before[categoryId], after[categoryId])
      && before[categoryId] !== after[categoryId])
    .map((categoryId) => ({
      categoryId,
      before: before[categoryId],
      after: after[categoryId],
    }))
  const strengthsHeld = strong.filter((categoryId) =>
    onGoodSide(categoryId, after[categoryId], afterMean[categoryId]))
  const strengthsIntact = strong.every((categoryId) =>
    !onBadSide(categoryId, after[categoryId], afterMean[categoryId]))

  return {
    gains,
    worsened,
    strengthsHeld,
    improved: gains.length > 0,
    strengthsIntact,
  }
}
