import type { SeasonPlayer, SeasonSlot } from "@/lib/season/types"

export const slotDisplayLabel = (slot: SeasonSlot): string =>
  slot === "IL" ? "IR" : slot

export const formatPlayerPositions = (
  player: Pick<SeasonPlayer, "positions"> | null | undefined,
): string => {
  const positions = player?.positions
  if (!positions?.length) return "—"
  return positions.join("/")
}
