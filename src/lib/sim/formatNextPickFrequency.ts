export const formatNextPickFrequency = (frequency: number): string => {
  const pct = Math.round(Math.min(1, Math.max(0, frequency)) * 100)
  return `~${pct}%`
}
