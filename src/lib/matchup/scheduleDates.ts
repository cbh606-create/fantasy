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
