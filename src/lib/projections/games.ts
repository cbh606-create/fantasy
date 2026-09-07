const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const gamesPrior = (lastGp: number, positionMeanGp: number): number => {
  const w = lastGp / (lastGp + 30)
  return clamp(Math.round(w * lastGp + (1 - w) * positionMeanGp), 1, 82)
}
