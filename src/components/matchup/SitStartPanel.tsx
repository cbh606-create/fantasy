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
  <section>
    <h2 className="text-lg font-semibold">Sit / Start</h2>
    {!suggestions.length ? (
      <p className="mt-3 border-y border-[var(--color-hairline)] py-6 text-[0.8125rem] text-[var(--color-mute)]">
        Lineup looks solid — no improving swaps found.
      </p>
    ) : (
      <ul
        aria-label="Sit start recommendations"
        className="mt-3 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
      >
        {suggestions.map((suggestion) => {
          const benchName = playerName(suggestion.benchPlayerId, playersById)
          const activeName = playerName(suggestion.activePlayerId, playersById)
          const key = swapKey(suggestion)
          const isApplying = applyingSwapKey === key

          return (
            <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-[0.8125rem]" key={key}>
              <div>
                <p className="font-semibold">
                  Start {benchName} over {activeName}
                </p>
                <p className="mt-1 text-xs text-[var(--color-info)]">
                  {suggestion.reason}
                </p>
              </div>
              <button
                aria-label={`Start ${benchName} over ${activeName}`}
                className="rounded-full border border-[var(--color-hairline)] px-4 py-1.5 font-medium transition-colors hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isApplying}
                onClick={() => onApply(suggestion)}
                type="button"
              >
                {isApplying ? "Applying…" : "Apply"}
              </button>
            </li>
          )
        })}
      </ul>
    )}
  </section>
)
