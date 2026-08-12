import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonSlot } from "@/lib/season/types"

export const ASSUMED_SEASON_GAMES = 82
export const MAX_SIT_START = 5
export const MAX_STREAMERS = 8
export const MIN_STREAMER_GAMES = 2
export const MATCHUP_SIGMOID_SCALE = 2
export const ACTIVE_SEASON_SLOTS: SeasonSlot[] = SEASON_ROSTER_SLOTS.filter(
  (slot) => slot !== "BE" && slot !== "IL",
)
export const isActiveSlot = (slot: SeasonSlot) =>
  ACTIVE_SEASON_SLOTS.includes(slot)
