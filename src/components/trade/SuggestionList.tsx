import type { SeasonLeagueState } from "@/lib/season/types"
import type { TradeSuggestion } from "@/lib/trade/types"

export const NO_SUGGESTIONS_COPY =
  "No mutually beneficial deals found under current rules."

type SuggestionListProps = {
  suggestions: TradeSuggestion[]
  state: SeasonLeagueState
  selectedId: string | null
  onSelect: (suggestionId: string) => void
}

const playerNames = (playerIds: string[], state: SeasonLeagueState) =>
  playerIds.map((playerId) =>
    state.players.find((player) => player.id === playerId)?.name ?? "Unknown player",
  ).join(" + ")

export const SuggestionList = ({
  suggestions,
  state,
  selectedId,
  onSelect,
}: SuggestionListProps) => {
  if (!suggestions.length) {
    return (
      <p className="border-y border-[var(--color-hairline)] py-6 text-sm text-[var(--color-mute)]">
        {NO_SUGGESTIONS_COPY}
      </p>
    )
  }

  return (
    <ul
      aria-label="Trade suggestions"
      className="divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
    >
      {suggestions.map((suggestion) => {
        const giveNames = playerNames(suggestion.givePlayerIds, state)
        const getNames = playerNames(suggestion.getPlayerIds, state)
        const counterparty = state.teams.find(
          (team) => team.teamIndex === suggestion.counterpartyTeamIndex,
        )?.name ?? `Team ${suggestion.counterpartyTeamIndex + 1}`

        return (
          <li key={suggestion.id}>
            <button
              aria-label={`Trade ${giveNames} for ${getNames}`}
              aria-pressed={selectedId === suggestion.id}
              className={`w-full px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                selectedId === suggestion.id
                  ? "bg-[var(--color-soft-cloud)]"
                  : "hover:bg-[var(--color-soft-cloud)]"
              }`}
              onClick={() => onSelect(suggestion.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{getNames}</span>
                <span className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-xs">
                  {suggestion.shape}
                </span>
              </span>
              <span className="mt-1 block text-[var(--color-mute)]">
                Give {giveNames} · {counterparty}
              </span>
              <span className="mt-1 block text-xs text-[var(--color-info)]">
                {suggestion.reasons[0] ?? "Mutually beneficial package"}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
