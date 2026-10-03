import type { SeasonLeagueState } from "@/lib/season/types"
import type { CategoryTotalMove } from "@/lib/trade/accept"
import type { TradeSuggestion } from "@/lib/trade/types"

type DealDetailProps = {
  suggestion: TradeSuggestion
  state: SeasonLeagueState
}

const playerNames = (playerIds: string[], state: SeasonLeagueState) =>
  playerIds.map((playerId) =>
    state.players.find((player) => player.id === playerId)?.name ?? "Unknown player",
  ).join(" + ")

const GainRow = ({ gain }: { gain: CategoryTotalMove | undefined }) => {
  if (!gain) {
    return null
  }

  return (
    <div>
      <h3 className="text-sm font-semibold">Your gain</h3>
      <div className="mt-2 flex items-center justify-between gap-4 border-y border-[var(--color-hairline)] py-2 text-[0.8125rem]">
        <span className="font-medium">{gain.categoryId}</span>
        <span className="tabular-nums text-[var(--color-mute)]">
          {gain.before} → {gain.after}
        </span>
      </div>
    </div>
  )
}

export const DealDetail = ({ suggestion, state }: DealDetailProps) => {
  const giveNames = playerNames(suggestion.givePlayerIds, state)
  const getNames = playerNames(suggestion.getPlayerIds, state)
  const counterparty = state.teams.find(
    (team) => team.teamIndex === suggestion.counterpartyTeamIndex,
  )?.name ?? `Team ${suggestion.counterpartyTeamIndex + 1}`

  return (
    <section className="rounded-3xl border border-[var(--color-hairline)] p-5 sm:p-6">
      <p className="text-xs tracking-[0.14em] text-[var(--color-mute)] uppercase">
        Receive
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{getNames}</h2>
      <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]">
        Send {giveNames} to {counterparty}
      </p>
      {suggestion.droppedPlayerId ? (
        <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]">
          Drops {playerNames([suggestion.droppedPlayerId], state)} to open a
          roster spot
        </p>
      ) : null}
      <div className="mt-6">
        <GainRow gain={suggestion.youGains[0]} />
      </div>
      <ul className="mt-6 space-y-1 text-[0.8125rem] text-[var(--color-mute)]">
        {suggestion.reasons.map((reason) => (
          <li key={reason}>• {reason}</li>
        ))}
      </ul>
    </section>
  )
}
