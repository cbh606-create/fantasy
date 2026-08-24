import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonPlayer, SeasonSlot } from "@/lib/season/types"

export const rosterSlotsFor = (state: {
  rosterSlots?: SeasonSlot[]
}): SeasonSlot[] =>
  state.rosterSlots?.length ? state.rosterSlots : SEASON_ROSTER_SLOTS

export const activeSlotsFor = (rosterSlots: SeasonSlot[]): SeasonSlot[] =>
  rosterSlots.filter((slot) => slot !== "BE" && slot !== "IL")

export const eligibleForSlot = (
  player: Pick<SeasonPlayer, "positions"> | null | undefined,
  slot: SeasonSlot,
): boolean => {
  if (slot === "BE" || slot === "IL") return true
  if (slot === "UTIL") return true

  const positions = player?.positions
  if (!positions?.length) return false

  if (slot === "G") {
    return positions.some((p) => p === "PG" || p === "SG" || p === "G")
  }
  if (slot === "F") {
    return positions.some((p) => p === "SF" || p === "PF" || p === "F")
  }

  return positions.includes(slot)
}
