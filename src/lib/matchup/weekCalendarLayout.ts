/** Shared week table so Daily lineup and Streaming plan date columns line up. */

export const MATCHUP_WEEK_SLOT_COL_CLASS = "w-12 min-w-12 max-w-12"
export const MATCHUP_WEEK_PLAYER_COL_CLASS =
  "w-[13rem] min-w-[13rem] max-w-[13rem]"
/** Slot + player — use as the Streaming plan first column. */
export const MATCHUP_WEEK_GUTTER_COL_CLASS =
  "w-[16rem] min-w-[16rem] max-w-[16rem]"
export const MATCHUP_WEEK_DAY_COL_CLASS =
  "w-24 min-w-24 max-w-24"
export const MATCHUP_WEEK_TABLE_CLASS =
  "w-full min-w-[58rem] table-fixed border-collapse"

export const formatMatchupDayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
