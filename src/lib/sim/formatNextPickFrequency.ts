export const formatNextPickFrequency = (frequency: number): string => {
  const pct = Math.round(Math.min(1, Math.max(0, frequency)) * 100)
  return `~${pct}%`
}

export const formatNextPickShares = (frequencies: number[]): string[] => {
  const clamped = frequencies.map((frequency) =>
    Number.isFinite(frequency) ? Math.min(1, Math.max(0, frequency)) : 0,
  )
  const total = clamped.reduce((sum, frequency) => sum + frequency, 0)

  if (total <= 0) {
    return frequencies.map(() => "")
  }

  const scaled = clamped.map((frequency) => (frequency / total) * 100)
  const floors = scaled.map((value) => Math.floor(value))
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0)
  const byFraction = scaled
    .map((value, index) => ({
      index,
      fraction: value - floors[index],
      frequency: clamped[index],
    }))
    .sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction
      }

      return left.index - right.index
    })

  const extras = new Set<number>()
  for (const { index, frequency } of byFraction) {
    if (remainder <= 0) {
      break
    }
    if (frequency <= 0) {
      continue
    }

    extras.add(index)
    remainder -= 1
  }

  return floors.map(
    (value, index) => `${value + (extras.has(index) ? 1 : 0)}%`,
  )
}
