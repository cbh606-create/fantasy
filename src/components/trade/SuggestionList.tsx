import { useState, type ReactNode } from "react"
import { tradableRosterPlayerIds } from "@/components/trade/RosterIncludeGroups"
import type { SeasonLeagueState } from "@/lib/season/types"
import { TRADE_PAGE_SIZE } from "@/lib/trade/constants"
import type { TradeSuggestion } from "@/lib/trade/types"

export const NO_SUGGESTIONS_COPY =
  "No mutually beneficial deals found under current rules."

export const ALL_HOLD_EMPTY_COPY =
  "Every player is on Hold. Tap a player to make them tradable."

const isAllRosterOnHold = (
  state: SeasonLeagueState,
  excludedIds: string[],
) => {
  const tradableIds = tradableRosterPlayerIds(state)
  if (!tradableIds.length) return false

  const excluded = new Set(excludedIds)
  return tradableIds.every((playerId) => excluded.has(playerId))
}

type SuggestionListProps = {
  suggestions: TradeSuggestion[]
  state: SeasonLeagueState
  excludedIds?: string[]
  selectedId: string | null
  onSelect: (suggestionId: string) => void
  selectedDetail?: ReactNode
}

const playerNames = (playerIds: string[], state: SeasonLeagueState) =>
  playerIds.map((playerId) =>
    state.players.find((player) => player.id === playerId)?.name ?? "Unknown player",
  ).join(" + ")

export const SuggestionList = ({
  suggestions,
  state,
  excludedIds = [],
  selectedId,
  onSelect,
  selectedDetail,
}: SuggestionListProps) => {
  const suggestionKey = suggestions.map((suggestion) => suggestion.id).join(",")
  const [visibleCount, setVisibleCount] = useState(TRADE_PAGE_SIZE)
  const [renderedKey, setRenderedKey] = useState(suggestionKey)

  if (renderedKey !== suggestionKey) {
    setRenderedKey(suggestionKey)
    setVisibleCount(TRADE_PAGE_SIZE)
  }

  if (!suggestions.length) {
    const emptyCopy = isAllRosterOnHold(state, excludedIds)
      ? ALL_HOLD_EMPTY_COPY
      : NO_SUGGESTIONS_COPY

    return (
      <p className="border-y border-[var(--color-hairline)] py-6 text-sm text-[var(--color-mute)]">
        {emptyCopy}
      </p>
    )
  }

  const remaining = suggestions.length - visibleCount
  const nextCount = Math.min(TRADE_PAGE_SIZE, remaining)

  const handleShowMore = () => setVisibleCount(visibleCount + nextCount)

  return (
    <>
      <ul
        aria-label="Trade suggestions"
        className="border-t border-[var(--color-hairline)]"
      >
        {suggestions.slice(0, visibleCount).map((suggestion) => {
          const giveNames = playerNames(suggestion.givePlayerIds, state)
          const getNames = playerNames(suggestion.getPlayerIds, state)
          const counterparty = state.teams.find(
            (team) => team.teamIndex === suggestion.counterpartyTeamIndex,
          )?.name ?? `Team ${suggestion.counterpartyTeamIndex + 1}`
          const selected = selectedId === suggestion.id

          return (
            <li
              className="border-b border-[var(--color-hairline)] lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-x-8"
              key={suggestion.id}
            >
              <button
                aria-label={`Trade ${giveNames} for ${getNames}`}
                aria-pressed={selected}
                className={`w-full px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                  selected
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
              {selected && selectedDetail ? (
                <div className="px-3 py-4 lg:px-0 lg:py-3">
                  {selectedDetail}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {remaining > 0 ? (
        <button
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
          onClick={handleShowMore}
          type="button"
        >
          <span aria-hidden="true">↓</span>
          Show {nextCount} more
        </button>
      ) : null}
    </>
  )
}
