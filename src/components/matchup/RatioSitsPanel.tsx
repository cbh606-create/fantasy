import type { SeasonPlayer } from "@/lib/season/types"
import type { RatioSitSuggestion } from "@/lib/matchup/types"

type RatioSitsPanelProps = {
  suggestions: RatioSitSuggestion[]
  playersById: Record<string, SeasonPlayer>
  applyingKey: string | null
  onApply: (suggestion: RatioSitSuggestion) => void
  applyDisabled?: boolean
}

const playerName = (
  playerId: string,
  playersById: Record<string, SeasonPlayer>,
) => playersById[playerId]?.name ?? "Unknown player"

const ratioSitKey = (suggestion: RatioSitSuggestion) =>
  `${suggestion.playerId}:${suggestion.date}`

export const RatioSitsPanel = ({
  suggestions,
  playersById,
  applyingKey,
  onApply,
  applyDisabled = false,
}: RatioSitsPanelProps) => (
  <section className="opacity-90">
    <h2 className="text-sm font-medium text-[var(--color-mute)]">Ratio sits</h2>
    <p className="mt-1 text-[0.7rem] text-[var(--color-mute)]">
      Empty-slot sits to help FG%/FT%/TO without giving back counting wins
    </p>
    {!suggestions.length ? (
      <p className="mt-2 py-2 text-[0.75rem] text-[var(--color-mute)]">
        No ratio sits right now.
      </p>
    ) : (
      <ul
        aria-label="Ratio sit recommendations"
        className="mt-2 divide-y divide-[var(--color-hairline)] border-t border-[var(--color-hairline)]"
      >
        {suggestions.map((suggestion) => {
          const name = playerName(suggestion.playerId, playersById)
          const key = ratioSitKey(suggestion)
          const isApplying = applyingKey === key

          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-[0.75rem]"
              key={key}
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-ink)]">
                  Sit {name} · {suggestion.reason}
                </p>
              </div>
              {!applyDisabled ? (
                <button
                  aria-label={`Sit ${name} on ${suggestion.date}`}
                  className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isApplying}
                  onClick={() => onApply(suggestion)}
                  type="button"
                >
                  {isApplying ? "…" : "Apply"}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    )}
  </section>
)
