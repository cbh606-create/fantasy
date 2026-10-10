export const parseIsoDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export const formatUtcIsoDate = (date: Date) => date.toISOString().slice(0, 10)

export const buildWeekDays = (startIso: string, endIso: string): string[] => {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  const days: string[] = []

  for (const current = start; current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    days.push(formatUtcIsoDate(current))
  }

  return days
}

/** Monday–Sunday ISO dates for the America/New_York fantasy week containing `isoDate`. */
export const weekContainingIsoDate = (
  isoDate: string,
): { startIso: string; endIso: string; days: string[] } => {
  const day = parseIsoDate(isoDate)
  const daysSinceMonday = (day.getUTCDay() + 6) % 7
  const start = new Date(day)
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const startIso = formatUtcIsoDate(start)
  const endIso = formatUtcIsoDate(end)
  return { startIso, endIso, days: buildWeekDays(startIso, endIso) }
}
