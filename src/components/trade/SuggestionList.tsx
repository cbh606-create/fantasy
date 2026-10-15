import { useState, type ReactNode } from "react"
import { tradableRosterPlayerIds } from "@/components/trade/RosterIncludeGroups"
import { PlayerValueNames } from "@/components/trade/PlayerValueNames"
import type { SeasonLeagueState } from "@/lib/season/types"
import { TRADE_PAGE_SIZE } from "@/lib/trade/constants"
import type { TradeSuggestion } from "@/lib/trade/types"
import { buildPlayerValueMap } from "@/lib/trade/value"

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
  const [teamFilter, setTeamFilter] = useState<number | "all">("all")
  const [renderedKey, setRenderedKey] = useState(suggestionKey)

  if (renderedKey !== suggestionKey) {
    setRenderedKey(suggestionKey)
    setVisibleCount(TRADE_PAGE_SIZE)
    setTeamFilter("all")
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

  const values = buildPlayerValueMap(state)
  const named = (playerIds: string[]) =>
    playerIds.map((playerId) => ({
      id: playerId,
      name: state.players.find((player) => player.id === playerId)?.name ?? "Unknown player",
      value: values.get(playerId) ?? 0,
    }))
  const teamName = (teamIndex: number) =>
    state.teams.find((team) => team.teamIndex === teamIndex)?.name
    ?? `Team ${teamIndex + 1}`
  const teams = [...new Set(suggestions.map((suggestion) => suggestion.counterpartyTeamIndex))]
    .map((teamIndex) => ({ teamIndex, name: teamName(teamIndex) }))
    .sort((left, right) => left.name.localeCompare(right.name))
  const activeFilter = teamFilter === "all" || teams.some((team) => team.teamIndex === teamFilter)
    ? teamFilter
    : "all"
  const visibleSuggestions = activeFilter === "all"
    ? suggestions
    : suggestions.filter((suggestion) => suggestion.counterpartyTeamIndex === activeFilter)
  const remaining = visibleSuggestions.length - visibleCount
  const nextCount = Math.min(TRADE_PAGE_SIZE, remaining)

  const handleShowMore = () => setVisibleCount(visibleCount + nextCount)
  const handleTeamChange = (value: string) => {
    const nextFilter = value === "all" ? "all" : Number(value)
    const nextSuggestions = nextFilter === "all"
      ? suggestions
      : suggestions.filter((suggestion) => suggestion.counterpartyTeamIndex === nextFilter)
    setTeamFilter(nextFilter)
    setVisibleCount(TRADE_PAGE_SIZE)
    if (nextSuggestions[0] && !nextSuggestions.some((suggestion) => suggestion.id === selectedId)) {
      onSelect(nextSuggestions[0].id)
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div>
        <select
          aria-label="Team"
          className="mb-3 flex h-9 w-full items-center rounded border border-[var(--color-hairline)] px-2 text-sm font-semibold"
          onChange={(event) => handleTeamChange(event.target.value)}
          value={activeFilter}
        >
          <option value="all">All teams</option>
          {teams.map((team) => (
            <option key={team.teamIndex} value={team.teamIndex}>
              {team.name}
            </option>
          ))}
        </select>
        <ul
          aria-label="Trade suggestions"
          className="border-t border-[var(--color-hairline)]"
        >
          {visibleSuggestions.slice(0, visibleCount).map((suggestion) => {
            const giveNames = playerNames(suggestion.givePlayerIds, state)
            const getNames = playerNames(suggestion.getPlayerIds, state)
            const counterparty = teamName(suggestion.counterpartyTeamIndex)
            const selected = selectedId === suggestion.id

            return (
              <li
                className="border-b border-[var(--color-hairline)]"
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
                    <span className="font-semibold">
                      <PlayerValueNames players={named(suggestion.getPlayerIds)} />
                    </span>
                    <span className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-xs">
                      {suggestion.shape}
                    </span>
                  </span>
                  <span className="mt-1 block text-[var(--color-mute)]">
                    Give <PlayerValueNames players={named(suggestion.givePlayerIds)} /> · {counterparty}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--color-info)]">
                    {suggestion.reasons[0] ?? "Mutually beneficial package"}
                  </span>
                </button>
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
      </div>
      {selectedDetail ? (
        <div>{selectedDetail}</div>
      ) : null}
    </div>
  )
}
