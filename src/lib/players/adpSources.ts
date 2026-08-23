import type { Player } from "@/lib/domain/types"

export const ADP_SOURCE_IDS = [
  "yahoo_draft_analysis_rank",
  "fantasypros_yahoo",
  "espn_article_h2h_points",
] as const

export type AdpSourceId = (typeof ADP_SOURCE_IDS)[number]

export const DEFAULT_ADP_SOURCE: AdpSourceId = "yahoo_draft_analysis_rank"

export const ADP_SOURCES: Record<
  AdpSourceId,
  { id: AdpSourceId; label: string; shortLabel: string }
> = {
  yahoo_draft_analysis_rank: {
    id: "yahoo_draft_analysis_rank",
    label: "Yahoo rank",
    shortLabel: "Yahoo",
  },
  fantasypros_yahoo: {
    id: "fantasypros_yahoo",
    label: "FantasyPros Yahoo",
    shortLabel: "FP",
  },
  espn_article_h2h_points: {
    id: "espn_article_h2h_points",
    label: "ESPN article",
    shortLabel: "ESPN",
  },
}

export const projectAdpFromSource = (
  player: Player,
  source: AdpSourceId,
): number => {
  const fromSource = player.adpBySource?.[source]
  if (typeof fromSource === "number" && Number.isFinite(fromSource) && fromSource > 0) {
    return fromSource
  }
  return player.adp
}

export const withProjectedAdp = (
  players: Player[],
  source: AdpSourceId,
): Player[] =>
  [...players]
    .map((player) => ({
      ...player,
      adp: projectAdpFromSource(player, source),
    }))
    .sort((left, right) => left.adp - right.adp || left.id.localeCompare(right.id))

export const formatAdpValue = (adp: number) =>
  Number.isInteger(adp) ? String(adp) : adp.toFixed(1)

export const formatAdpReferenceLine = (
  player: Player,
  primary: AdpSourceId,
): string => {
  const parts = ADP_SOURCE_IDS.filter((id) => id !== primary).map((id) => {
    const value = player.adpBySource?.[id]
    const label = ADP_SOURCES[id].shortLabel
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${label} —`
    }
    return `${label} ${formatAdpValue(value)}`
  })
  return `ADP ${formatAdpValue(player.adp)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`
}
