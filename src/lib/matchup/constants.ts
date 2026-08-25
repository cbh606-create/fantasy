import { SEASON_ROSTER_SLOTS } from "@/lib/season/slots"
import type { SeasonSlot } from "@/lib/season/types"
import type { CategoryId } from "@/lib/domain/types"

export const ASSUMED_SEASON_GAMES = 82
export const B2B_SECOND_NIGHT_PLAY_RATE = 0.75
export const MAX_SIT_START = 5
export const MAX_RATIO_SITS = 5
export const MAX_STREAMERS = 8
export const WEEKLY_ADD_LIMIT = 7
export const STREAMING_PROTECTED_ADP_MAX = 60
export const MIN_STREAMER_GAMES = 2
export const MATCHUP_CATEGORY_SIGMOID_SCALE = {
  PTS: 15,
  REB: 12,
  AST: 12,
  TPM: 10,
  STL: 4,
  BLK: 4,
  TO: 5,
  FG_PCT: 0.03,
  FT_PCT: 0.03,
} as const satisfies Record<CategoryId, number>
export const ACTIVE_SEASON_SLOTS: SeasonSlot[] = SEASON_ROSTER_SLOTS.filter(
  (slot) => slot !== "BE" && slot !== "IL",
)
export const isActiveSlot = (slot: SeasonSlot) =>
  ACTIVE_SEASON_SLOTS.includes(slot)
