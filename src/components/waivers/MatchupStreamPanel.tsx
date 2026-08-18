import { useEffect, useState, type ChangeEvent } from "react"
import { MATCHUP_STREAM_DAY_COUNTS } from "@/lib/waivers/matchupStreamConstants"
import type {
  MatchupStreamPair,
  MatchupStreamPlayerSummary,
  MatchupStreamResult,
} from "@/lib/waivers/matchupStreamTypes"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"

type MatchupStreamPanelProps = {
  dayCount: number | null
  leagueId: string
  onDayCountChange: (dayCount: number | null) => void
  onOpponentChange: (opponentTeamIndex: number | null) => void
  onSelectPair: (addPlayerId: string, dropPlayerId: string | null) => void
  opponentTeamIndex: number | null
  playersById: Record<string, SeasonPlayer>
  selectedAddId: string | null
  selectedDropId: string | null
  state: SeasonLeagueState
}

const DAY_CHIPS: Array<{ label: string; value: number | null }> = [
  { label: "Full week", value: null },
  ...MATCHUP_STREAM_DAY_COUNTS.map((count) => ({
    label: String(count),
    value: count,
  })),
]

const resolvePlayerName = (
  playerId: string,
  playersById: Record<string, SeasonPlayer>,
  state: SeasonLeagueState,
) =>
  playersById[playerId]?.name ??
  state.players.find((player) => player.id === playerId)?.name ??
  "Unknown player"

const pairAriaLabel = (
  pair: MatchupStreamPair,
  playersById: Record<string, SeasonPlayer>,
  state: SeasonLeagueState,
) => {
  const addName = resolvePlayerName(pair.addPlayerId, playersById, state)
  if (!pair.dropPlayerId) return `Add ${addName} / empty slot`

  const dropName = resolvePlayerName(pair.dropPlayerId, playersById, state)
  return `Add ${addName} / drop ${dropName}`
}

const windowBlurb = (dayCount: number | null) =>
  dayCount == null ? "This week" : `Next ${dayCount} days`

export const MatchupStreamPanel = ({
  dayCount,
  leagueId,
  onDayCountChange,
  onOpponentChange,
  onSelectPair,
  opponentTeamIndex,
  playersById,
  selectedAddId,
  selectedDropId,
  state,
}: MatchupStreamPanelProps) => {
  const [stream, setStream] = useState<MatchupStreamResult | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  const opponents = state.teams.filter(
    (team) => team.teamIndex !== state.perspectiveTeamIndex,
  )

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ seasonLeagueId: leagueId })
    if (opponentTeamIndex != null) {
      params.set("opponentTeamIndex", String(opponentTeamIndex))
    }
    if (dayCount != null) {
      params.set("dayCount", String(dayCount))
    }

    const loadStream = async () => {
      setIsLoading(true)
      setError("")

      try {
        const response = await fetch(
          `/api/waivers/matchup-stream?${params.toString()}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error("Unable to load matchup stream")
        }

        const payload = (await response.json()) as MatchupStreamResult
        setStream(payload)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return
        }

        setStream(null)
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load matchup stream",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadStream()

    return () => controller.abort()
  }, [dayCount, leagueId, opponentTeamIndex])

  const handleOpponentChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    onOpponentChange(value === "" ? null : Number.parseInt(value, 10))
  }

  const handleDayCountClick = (value: number | null) => {
    onDayCountChange(value)
  }

  const handleSelectPair = (pair: MatchupStreamPair) => {
    onSelectPair(pair.addPlayerId, pair.dropPlayerId)
  }

  const handleSelectTopAdd = (summary: MatchupStreamPlayerSummary) => {
    onSelectPair(summary.playerId, selectedDropId)
  }

  const handleSelectTopDrop = (summary: MatchupStreamPlayerSummary) => {
    if (!selectedAddId) return
    onSelectPair(selectedAddId, summary.playerId)
  }

  return (
    <section className="rounded-3xl bg-[var(--color-soft-cloud)] p-5">
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
        Short-horizon
      </p>
      <h2 className="mt-1 text-lg font-semibold">Matchup stream</h2>
      <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
        {windowBlurb(dayCount)} · streaming add/drop vs season pickups
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[0.8125rem]">
          <span className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
            Opponent
          </span>
          <select
            aria-label="Matchup stream opponent"
            className="rounded-xl border border-[var(--color-hairline)] bg-white px-3 py-2 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            onChange={handleOpponentChange}
            value={opponentTeamIndex ?? ""}
          >
            <option value="">No opponent (volume)</option>
            {opponents.map((team) => (
              <option key={team.teamIndex} value={team.teamIndex}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-1.5 text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
            Window
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Matchup stream window">
            {DAY_CHIPS.map((chip) => (
              <button
                aria-label={chip.value == null ? "Full week" : `${chip.label} days`}
                aria-pressed={dayCount === chip.value}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                  dayCount === chip.value
                    ? "border-[var(--color-ink)] bg-white"
                    : "border-[var(--color-hairline)] bg-white hover:bg-[var(--color-canvas)]"
                }`}
                key={chip.label}
                onClick={() => handleDayCountClick(chip.value)}
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stream?.mode === "volume" ? (
        <p className="mt-4 text-[0.8125rem] text-[var(--color-info)]">
          Volume / needs — pick an opponent for H2H deltas
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--color-mute)]" role="status">
          Loading matchup stream…
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-[var(--color-sale)]" role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && !stream?.pairs.length ? (
        <p className="mt-4 border-y border-[var(--color-hairline)] py-6 text-[0.8125rem] text-[var(--color-mute)]">
          No positive stream pairs for this window.
        </p>
      ) : null}

      {stream?.pairs.length ? (
        <ul
          aria-label="Matchup stream pairs"
          className="mt-4 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)]"
        >
          {stream.pairs.map((pair) => {
            const addName = resolvePlayerName(pair.addPlayerId, playersById, state)
            const dropName = pair.dropPlayerId
              ? resolvePlayerName(pair.dropPlayerId, playersById, state)
              : "Empty slot"
            const isSelected =
              selectedAddId === pair.addPlayerId &&
              selectedDropId === pair.dropPlayerId

            return (
              <li key={`${pair.addPlayerId}-${pair.dropPlayerId ?? "empty"}`}>
                <button
                  aria-label={pairAriaLabel(pair, playersById, state)}
                  aria-pressed={isSelected}
                  className={`w-full px-3 py-3 text-left text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    isSelected
                      ? "bg-white"
                      : "hover:bg-white"
                  }`}
                  onClick={() => handleSelectPair(pair)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {addName} → {dropName}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--color-mute)]">
                      {pair.deltaCatWins != null
                        ? `Δ ${pair.deltaCatWins.toFixed(1)}`
                        : pair.score.toFixed(2)}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-[var(--color-mute)]">
                    {pair.addGames}g add · {pair.dropGames}g drop
                  </span>
                  <span className="mt-1 block text-xs text-[var(--color-info)]">
                    {pair.reasons[0] ?? "Positive stream pair"}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {stream && (stream.topAdds.length > 0 || stream.topDrops.length > 0) ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Top adds</h3>
            {stream.topAdds.length ? (
              <ul aria-label="Top stream adds" className="mt-2 space-y-1">
                {stream.topAdds.map((summary) => {
                  const name = resolvePlayerName(
                    summary.playerId,
                    playersById,
                    state,
                  )

                  return (
                    <li key={summary.playerId}>
                      <button
                        aria-label={`Stream add ${name}`}
                        className="w-full rounded-xl px-2 py-1.5 text-left text-[0.8125rem] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                        onClick={() => handleSelectTopAdd(summary)}
                        type="button"
                      >
                        <span className="font-medium">{name}</span>
                        <span className="ml-2 text-xs text-[var(--color-mute)]">
                          {summary.games}g
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-mute)]">None</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Top drops</h3>
            {stream.topDrops.length ? (
              <ul aria-label="Top stream drops" className="mt-2 space-y-1">
                {stream.topDrops.map((summary) => {
                  const name = resolvePlayerName(
                    summary.playerId,
                    playersById,
                    state,
                  )

                  return (
                    <li key={summary.playerId}>
                      <button
                        aria-label={`Stream drop ${name}`}
                        className="w-full rounded-xl px-2 py-1.5 text-left text-[0.8125rem] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                        onClick={() => handleSelectTopDrop(summary)}
                        type="button"
                      >
                        <span className="font-medium">{name}</span>
                        <span className="ml-2 text-xs text-[var(--color-mute)]">
                          {summary.games}g
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-mute)]">None</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
