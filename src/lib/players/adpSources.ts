import type { Player } from "@/lib/domain/types"

/** All known source ids (including hidden / stale ones kept on pool JSON). */
export const ADP_SOURCE_IDS = [
  "yahoo_draft_analysis_rank",
  "fantasypros_yahoo",
  "espn_article_h2h_points",
] as const

export type AdpSourceId = (typeof ADP_SOURCE_IDS)[number]

/** Sources shown in Mock Primary picker + reference line. */
export const SELECTABLE_ADP_SOURCE_IDS = [
  "yahoo_draft_analysis_rank",
  "espn_article_h2h_points",
] as const satisfies readonly AdpSourceId[]

export type SelectableAdpSourceId = (typeof SELECTABLE_ADP_SOURCE_IDS)[number]

export const DEFAULT_ADP_SOURCE: SelectableAdpSourceId =
  "yahoo_draft_analysis_rank"

export const ADP_SOURCES: Record<
  AdpSourceId,
  { id: AdpSourceId; label: string; shortLabel: string }
> = {
  yahoo_draft_analysis_rank: {
    id: "yahoo_draft_analysis_rank",
    label: "Yahoo Rank",
    shortLabel: "Yahoo",
  },
  fantasypros_yahoo: {
    id: "fantasypros_yahoo",
    label: "FantasyPros Yahoo (hidden)",
    shortLabel: "FP",
  },
  espn_article_h2h_points: {
    id: "espn_article_h2h_points",
    label: "ESPN ADP",
    shortLabel: "ESPN",
  },
}

export const isSelectableAdpSource = (
  value: unknown,
): value is SelectableAdpSourceId =>
  typeof value === "string" &&
  (SELECTABLE_ADP_SOURCE_IDS as readonly string[]).includes(value)

export const normalizeSelectableAdpSource = (
  value: unknown,
): SelectableAdpSourceId =>
  isSelectableAdpSource(value) ? value : DEFAULT_ADP_SOURCE

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
  const parts = SELECTABLE_ADP_SOURCE_IDS.filter((id) => id !== primary).map(
    (id) => {
      const value = player.adpBySource?.[id]
      const label = ADP_SOURCES[id].shortLabel
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${label} —`
      }
      return `${label} ${formatAdpValue(value)}`
    },
  )
  return `ADP ${formatAdpValue(player.adp)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`
}
