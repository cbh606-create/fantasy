/** Week table column widths. Daily stays compact; Streaming day cols grow with the panel. */

export const MATCHUP_WEEK_SLOT_COL_CLASS = "w-12 min-w-12 max-w-12"
export const MATCHUP_WEEK_PLAYER_COL_CLASS =
  "w-[8.5rem] min-w-[8.5rem] max-w-[8.5rem]"
/** Add/Drop label column on Streaming plans. */
export const MATCHUP_WEEK_MOVE_COL_CLASS = "w-28 min-w-28 max-w-28"
export const MATCHUP_WEEK_DAY_COL_CLASS =
  "w-20 min-w-20 max-w-20"
/** Streaming plan day cells — no max width so extra panel space goes to names/chips. */
export const MATCHUP_WEEK_STREAMING_DAY_COL_CLASS =
  "w-[6.75rem] min-w-[6.75rem]"
export const MATCHUP_WEEK_TABLE_CLASS =
  "w-full min-w-[44rem] table-fixed border-collapse"
export const MATCHUP_WEEK_STREAMING_TABLE_CLASS =
  "w-full min-w-[48rem] table-fixed border-collapse"

export const formatMatchupDayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
