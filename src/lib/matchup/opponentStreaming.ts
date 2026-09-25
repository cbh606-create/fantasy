import type { SeasonRosterEntry } from "@/lib/season/types"
import type { OppSpotChoice } from "./types"

export const emptyNonIlSeatCount = (entries: SeasonRosterEntry[]): number =>
  entries.filter((entry) => entry.slot !== "IL" && entry.playerId == null).length

export const resolveOppSpotCount = (
  choice: OppSpotChoice,
  entries: SeasonRosterEntry[],
): 1 | 2 | 3 => {
  if (choice !== "auto") return choice
  const open = emptyNonIlSeatCount(entries)
  if (open <= 0) return 1
  if (open >= 3) return 3
  return open as 1 | 2
}
