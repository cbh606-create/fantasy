import { seasonScoringModeLabel } from "@/lib/season/scoringMode"
import type { SeasonScoringMode } from "@/lib/season/types"

export const LeagueScoringLabel = ({
  mode,
}: {
  mode?: SeasonScoringMode
}) => {
  const label = seasonScoringModeLabel(mode)
  if (!label) return null

  return (
    <span className="text-sm font-medium tracking-normal text-[var(--color-mute)] normal-case">
      {label}
    </span>
  )
}
