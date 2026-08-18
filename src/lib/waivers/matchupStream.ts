import type { ScheduleResponse } from "@/lib/season/types"
import { MATCHUP_STREAM_DAY_COUNTS } from "./matchupStreamConstants"

export const resolveWindowDays = (
  schedule: ScheduleResponse,
  dayCount?: number,
): string[] => {
  const days = schedule.matchup.days
  if (dayCount == null || !Number.isInteger(dayCount) || dayCount < 1) {
    return [...days]
  }
  return days.slice(0, Math.min(dayCount, days.length))
}

export const isAllowedDayCount = (value: number): boolean =>
  (MATCHUP_STREAM_DAY_COUNTS as readonly number[]).includes(value)
