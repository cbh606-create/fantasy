const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const clampGames = (gp: number): number => clamp(Math.round(gp), 1, 82)

export const gamesPrior = (lastGp: number, positionMeanGp: number): number => {
  const w = lastGp / (lastGp + 30)
  return clampGames(w * lastGp + (1 - w) * positionMeanGp)
}
