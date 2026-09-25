export const DEFAULT_WAIVER_PERIOD_DAYS = 2

export const resolveWaiverPeriodDays = (options?: {
  inputDays?: number
  leagueDays?: number
}): number => {
  if (typeof options?.inputDays === "number" && options.inputDays >= 0) {
    return options.inputDays
  }
  if (typeof options?.leagueDays === "number" && options.leagueDays >= 0) {
    return options.leagueDays
  }
  return DEFAULT_WAIVER_PERIOD_DAYS
}

/** Drop day is always locked. Extra matchup days follow `periodDays`. */
export const isOnWaiverCooldown = (
  droppedOn: string,
  date: string,
  matchupDays: readonly string[],
  periodDays: number,
): boolean => {
  const from = matchupDays.indexOf(droppedOn)
  const to = matchupDays.indexOf(date)
  if (from < 0 || to < 0 || to < from) return true
  if (to === from) return true
  return to - from <= periodDays
}
