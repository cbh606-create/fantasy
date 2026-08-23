import type { Player } from "@/lib/domain/types"
import type { AdpSourceId } from "@/lib/players/adpSources"

export const DEFAULT_DEPTH_MULT = 1.5

export type DraftEligibleOptions = {
  primary: AdpSourceId
  teams: number
  rounds: number
  depthMult?: number
}

export const filterDraftEligible = (
  players: Player[],
  options: DraftEligibleOptions,
): Player[] => {
  const depthMult = options.depthMult ?? DEFAULT_DEPTH_MULT
  const maxAdp = options.teams * options.rounds * depthMult

  return players.filter((player) => {
    const primaryAdp = player.adpBySource?.[options.primary]
    if (
      typeof primaryAdp !== "number" ||
      !Number.isFinite(primaryAdp) ||
      primaryAdp <= 0
    ) {
      return false
    }
    return player.adp <= maxAdp
  })
}
