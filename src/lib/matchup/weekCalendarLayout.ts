/** Week table column widths. Daily is slightly wider; Streaming days share the same day-col size. */

export const MATCHUP_WEEK_SLOT_COL_CLASS = "w-12 min-w-12 max-w-12"
export const MATCHUP_WEEK_PLAYER_COL_CLASS =
  "w-[10rem] min-w-[10rem] max-w-[10rem]"
/** Add/Drop label column on Streaming plans. */
export const MATCHUP_WEEK_MOVE_COL_CLASS = "w-28 min-w-28 max-w-28"
export const MATCHUP_WEEK_DAY_COL_CLASS =
  "w-20 min-w-20 max-w-20"
export const MATCHUP_WEEK_TABLE_CLASS =
  "w-full min-w-[48rem] table-fixed border-collapse"
export const MATCHUP_WEEK_STREAMING_TABLE_CLASS =
  "w-full min-w-[42rem] table-fixed border-collapse"

export const formatMatchupDayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
