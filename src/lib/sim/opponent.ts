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

export const pickOpponentPlayer = (
  remaining: Player[],
  _roster: Player[],
  _weights: CategoryWeights,
  _leagueAvg: Record<CategoryId, number>,
  rng: () => number,
): Player => {
  if (remaining.length === 0) {
    throw new RangeError("Cannot pick an opponent player from an empty pool")
  }

  // Live CPU and sim opponents draft by ADP rank (lower is better). Need-based
  // scoring previously added a roster-wide constant that made late-ADP players
  // nearly as likely as stars under weighted random.
  const bestAdp = remaining.reduce(
    (lowest, player) => Math.min(lowest, player.adp),
    remaining[0].adp,
  )
  const tied = remaining.filter((player) => player.adp === bestAdp)

  if (tied.length === 1) {
    return tied[0]
  }

  const index = Math.min(
    tied.length - 1,
    Math.floor(rng() * tied.length),
  )

  return tied[index]
}
