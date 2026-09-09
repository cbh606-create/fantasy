import type { Player, RosterSlot } from "@/lib/domain/types"

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

export const positionNeedBonus = (player: Player, roster: Player[]): number => {
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

    if (isPrimarySlot || !canFillSlot(player, slot)) {
      continue
    }

    if (maximumStarterFits(roster, player, slotIndex) > currentFitCount) {
      return 25
    }
  }

  return 0
}
