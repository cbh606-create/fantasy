import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, Player, RosterSlot } from "@/lib/domain/types"

type CategoryWeights = Record<CategoryId, number>
type PlayerPosition = Player["positions"][number]

const DEFAULT_STARTER_SLOTS: RosterSlot[] = [
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
  "G",
  "F",
  "UTIL",
  "UTIL",
]

const GUARD_POSITIONS = new Set<PlayerPosition>(["PG", "SG"])
const FORWARD_POSITIONS = new Set<PlayerPosition>(["SF", "PF"])

const canFillSlot = (player: Player, slot: RosterSlot): boolean => {
  if (slot === "UTIL") {
    return true
  }

  if (slot === "G") {
    return player.positions.some((position) => GUARD_POSITIONS.has(position))
  }

  if (slot === "F") {
    return player.positions.some((position) => FORWARD_POSITIONS.has(position))
  }

  if (slot === "BE") {
    return false
  }

  return player.positions.includes(slot)
}

const maximumStarterFits = (
  players: Player[],
  candidate?: Player,
  candidateSlotIndex?: number,
): number => {
  const slotPlayers = Array<number | undefined>(DEFAULT_STARTER_SLOTS.length)

  if (candidate && candidateSlotIndex !== undefined) {
    slotPlayers[candidateSlotIndex] = -1
  }

  const tryAssignPlayer = (
    playerIndex: number,
    visitedSlots: Set<number>,
  ): boolean => {
    const player = players[playerIndex]

    for (let slotIndex = 0; slotIndex < DEFAULT_STARTER_SLOTS.length; slotIndex++) {
      if (
        visitedSlots.has(slotIndex) ||
        !canFillSlot(player, DEFAULT_STARTER_SLOTS[slotIndex])
      ) {
        continue
      }

      visitedSlots.add(slotIndex)
      const assignedPlayerIndex = slotPlayers[slotIndex]

      if (
        assignedPlayerIndex === undefined ||
        (assignedPlayerIndex >= 0 &&
          tryAssignPlayer(assignedPlayerIndex, visitedSlots))
      ) {
        slotPlayers[slotIndex] = playerIndex
        return true
      }
    }

    return false
  }

  let fitCount = candidate ? 1 : 0

  for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
    if (tryAssignPlayer(playerIndex, new Set())) {
      fitCount += 1
    }
  }

  return fitCount
}

const positionNeedBonus = (player: Player, roster: Player[]): number => {
  const primaryPosition = player.positions[0]
  const primaryPositionCovered = roster.some((rosterPlayer) =>
    rosterPlayer.positions.includes(primaryPosition),
  )

  if (!primaryPositionCovered) {
    return 50
  }

  const currentFitCount = maximumStarterFits(roster)

  for (let slotIndex = 0; slotIndex < DEFAULT_STARTER_SLOTS.length; slotIndex++) {
    const slot = DEFAULT_STARTER_SLOTS[slotIndex]
    const isPrimarySlot = slot === primaryPosition

    if (
      isPrimarySlot ||
      !canFillSlot(player, slot) ||
      maximumStarterFits(roster, player, slotIndex) <= currentFitCount
    ) {
      continue
    }

    return 25
  }

  return 0
}

const categoryNeedBonus = (
  roster: Player[],
  weights: CategoryWeights,
  leagueAvg: Record<CategoryId, number>,
): number => {
  return ALL_CATEGORY_IDS.reduce((bonus, categoryId) => {
    const rosterAverage =
      roster.reduce(
        (total, rosterPlayer) => total + rosterPlayer.projections[categoryId],
        0,
      ) / (roster.length || 1)
    const difference =
      categoryId === "TO"
        ? rosterAverage - leagueAvg[categoryId]
        : leagueAvg[categoryId] - rosterAverage

    return bonus + weights[categoryId] * Math.max(0, difference)
  }, 0)
}

export const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const scoreOpponentNeed = (
  player: Player,
  roster: Player[],
  weights: CategoryWeights,
  leagueAvg: Record<CategoryId, number>,
): number =>
  (1 / player.adp) * 100 +
  positionNeedBonus(player, roster) +
  categoryNeedBonus(roster, weights, leagueAvg)

export const SIM_ADP_WINDOW = 8
export const MOCK_ADP_WINDOW = 5
/** Scales category-fill vs ADP so needs can beat a small ADP edge inside the window. */
const MOCK_CATEGORY_FILL_WEIGHT = 4

const averageProjections = (
  players: Player[],
): Record<CategoryId, number> => {
  const averages = Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as Record<CategoryId, number>

  if (players.length === 0) return averages

  for (const player of players) {
    for (const categoryId of ALL_CATEGORY_IDS) {
      averages[categoryId] += player.projections[categoryId]
    }
  }

  for (const categoryId of ALL_CATEGORY_IDS) {
    averages[categoryId] /= players.length
  }

  return averages
}

/** How much this player fills categories where the roster lags the pool baseline. */
export const categoryFillBonus = (
  player: Player,
  roster: Player[],
  baseline: Record<CategoryId, number>,
): number => {
  const rosterAverage = averageProjections(roster)

  return ALL_CATEGORY_IDS.reduce((bonus, categoryId) => {
    const gap =
      categoryId === "TO"
        ? Math.max(0, rosterAverage[categoryId] - baseline[categoryId])
        : Math.max(0, baseline[categoryId] - rosterAverage[categoryId])

    if (gap <= 0) return bonus

    const contribution =
      categoryId === "TO"
        ? Math.max(0, baseline[categoryId] - player.projections[categoryId])
        : Math.max(0, player.projections[categoryId])

    return bonus + gap * contribution
  }, 0)
}

export const scoreSimOpponent = (
  player: Player,
  roster: Player[],
): number => (1 / player.adp) * 100 + positionNeedBonus(player, roster)

export const scoreMockOpponent = (
  player: Player,
  roster: Player[],
  baseline: Record<CategoryId, number>,
): number =>
  (1 / player.adp) * 100 +
  positionNeedBonus(player, roster) +
  categoryFillBonus(player, roster, baseline) * MOCK_CATEGORY_FILL_WEIGHT

export const pickLiveCpuByAdp = (
  remaining: Player[],
  rng: () => number,
): Player => {
  if (remaining.length === 0) {
    throw new RangeError("Cannot pick a live CPU player from an empty pool")
  }

  const bestAdp = remaining.reduce(
    (lowest, player) => Math.min(lowest, player.adp),
    remaining[0].adp,
  )
  const tied = remaining.filter((player) => player.adp === bestAdp)

  if (tied.length === 1) {
    return tied[0]
  }

  const index = Math.min(tied.length - 1, Math.floor(rng() * tied.length))
  return tied[index]
}

const pickWeightedFromWindow = (
  remaining: Player[],
  windowSize: number,
  scoreFor: (player: Player) => number,
  rng: () => number,
  emptyMessage: string,
): Player => {
  if (remaining.length === 0) {
    throw new RangeError(emptyMessage)
  }

  const candidates = [...remaining]
    .sort(
      (left, right) => left.adp - right.adp || left.id.localeCompare(right.id),
    )
    .slice(0, windowSize)

  const scores = candidates.map((player) => Math.max(0.01, scoreFor(player)))
  const totalScore = scores.reduce((total, score) => total + score, 0)
  const threshold = rng() * totalScore
  let cumulativeScore = 0

  for (let index = 0; index < candidates.length; index++) {
    cumulativeScore += scores[index]
    if (threshold < cumulativeScore) {
      return candidates[index]
    }
  }

  return candidates[candidates.length - 1]
}

export const pickSimOpponent = (
  remaining: Player[],
  roster: Player[],
  rng: () => number,
): Player =>
  pickWeightedFromWindow(
    remaining,
    SIM_ADP_WINDOW,
    (player) => scoreSimOpponent(player, roster),
    rng,
    "Cannot pick a sim opponent from an empty pool",
  )

/** Mock CPU: ADP top-5 window, then need-weighted random (position + category fill). */
export const pickMockCpu = (
  remaining: Player[],
  roster: Player[],
  rng: () => number,
): Player => {
  const baseline = averageProjections(remaining)

  return pickWeightedFromWindow(
    remaining,
    MOCK_ADP_WINDOW,
    (player) => scoreMockOpponent(player, roster, baseline),
    rng,
    "Cannot pick a mock CPU player from an empty pool",
  )
}
