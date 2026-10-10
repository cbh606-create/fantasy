import type { SeasonRosterEntry } from "@/lib/season/types"
import type { OppSpotChoice } from "./types"

export const emptyNonIlSeatCount = (entries: SeasonRosterEntry[]): number =>
  entries.filter((entry) => entry.slot !== "IL" && entry.playerId == null).length

export const resolveOppSpotCount = (
  choice: OppSpotChoice,
  _entries?: SeasonRosterEntry[],
): 0 | 1 | 2 | 3 => choice
