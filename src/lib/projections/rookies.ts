import type { Rates, RookiePrior } from "@/lib/projections/types"

export type DraftSlotPrior = {
  mpg: number
  usg: number
  gp: number
}

export const DRAFT_SLOT_TABLE: { min: number; max: number; prior: DraftSlotPrior }[] = [
  { min: 1, max: 4, prior: { mpg: 30, usg: 24, gp: 70 } },
  { min: 5, max: 14, prior: { mpg: 24, usg: 20, gp: 65 } },
  { min: 15, max: 30, prior: { mpg: 18, usg: 18, gp: 58 } },
  { min: 31, max: 60, prior: { mpg: 14, usg: 16, gp: 50 } }
]

const UNDRAFTED: DraftSlotPrior = { mpg: 10, usg: 14, gp: 40 }

export const rookiePlayingTime = (draftSlot: number | null): DraftSlotPrior => {
  if (draftSlot == null) return UNDRAFTED
  const row = DRAFT_SLOT_TABLE.find((bin) => draftSlot >= bin.min && draftSlot <= bin.max)
  return row?.prior ?? UNDRAFTED
}

const mix = (translated: number, mean: number) => 0.5 * translated + 0.5 * mean

export const rookieRates = (prior: RookiePrior, positionMean: Rates): Rates => {
  const translated = prior.rates
  if (!translated) return positionMean
  return {
    pts: mix(translated.pts, positionMean.pts),
    reb: mix(translated.reb, positionMean.reb),
    ast: mix(translated.ast, positionMean.ast),
    stl: mix(translated.stl, positionMean.stl),
    blk: mix(translated.blk, positionMean.blk),
    tov: mix(translated.tov, positionMean.tov),
    tpm: mix(translated.tpm, positionMean.tpm),
    shooting: {
      FGM: mix(translated.shooting.FGM, positionMean.shooting.FGM),
      FGA: mix(translated.shooting.FGA, positionMean.shooting.FGA),
      FTM: mix(translated.shooting.FTM, positionMean.shooting.FTM),
      FTA: mix(translated.shooting.FTA, positionMean.shooting.FTA)
    }
  }
}
