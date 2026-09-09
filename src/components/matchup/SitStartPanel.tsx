import type { SeasonPlayer } from "@/lib/season/types"
import type { SitStartSuggestion } from "@/lib/matchup/types"

type SitStartPanelProps = {
  suggestions: SitStartSuggestion[]
  playersById: Record<string, SeasonPlayer>
  applyingSwapKey: string | null
  onApply: (suggestion: SitStartSuggestion) => void
}

const playerName = (
  playerId: string,
  playersById: Record<string, SeasonPlayer>,
) => playersById[playerId]?.name ?? "Unknown player"

const swapKey = (suggestion: SitStartSuggestion) =>
  `${suggestion.benchPlayerId}:${suggestion.activePlayerId}`

export const SitStartPanel = ({
  suggestions,
  playersById,
  applyingSwapKey,
  onApply,
}: SitStartPanelProps) => (
  <section className="opacity-90">
    <h2 className="text-sm font-medium text-[var(--color-mute)]">Sit / Start</h2>
    <p className="mt-1 text-[0.7rem] text-[var(--color-mute)]">
      Secondary when most rostered players already have games
    </p>
    {!suggestions.length ? (
      <p className="mt-2 py-2 text-[0.75rem] text-[var(--color-mute)]">
        No improving swaps right now.
      </p>
    ) : (
      <ul
        aria-label="Sit start recommendations"
        className="mt-2 divide-y divide-[var(--color-hairline)] border-t border-[var(--color-hairline)]"
      >
        {suggestions.map((suggestion) => {
          const benchName = playerName(suggestion.benchPlayerId, playersById)
          const activeName = playerName(suggestion.activePlayerId, playersById)
          const key = swapKey(suggestion)
          const isApplying = applyingSwapKey === key

          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-[0.75rem]"
              key={key}
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-ink)]">
                  Start {benchName} over {activeName}
                </p>
                <p className="mt-0.5 text-[0.65rem] text-[var(--color-mute)]">
                  {suggestion.reason}
                </p>
              </div>
              <button
                aria-label={`Start ${benchName} over ${activeName}`}
                className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isApplying}
                onClick={() => onApply(suggestion)}
                type="button"
              >
                {isApplying ? "…" : "Apply"}
              </button>
            </li>
          )
        })}
      </ul>
    )}
  </section>
)
