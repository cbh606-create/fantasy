import type { SeasonLeagueState } from "@/lib/season/types"
import type { TradeSideImpact, TradeSuggestion } from "@/lib/trade/types"

type DealDetailProps = {
  suggestion: TradeSuggestion
  state: SeasonLeagueState
}

const playerNames = (playerIds: string[], state: SeasonLeagueState) =>
  playerIds.map((playerId) =>
    state.players.find((player) => player.id === playerId)?.name ?? "Unknown player",
  ).join(" + ")

const ImpactColumn = ({
  impact,
  title,
}: {
  impact: TradeSideImpact
  title: string
}) => (
  <div>
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-2 divide-y divide-[var(--color-hairline)] border-y border-[var(--color-hairline)] text-[0.8125rem]">
      {impact.categoryDeltas.map((delta) => (
        <div
          className="flex items-center justify-between gap-4 py-2"
          key={delta.categoryId}
        >
          <span className="font-medium">{delta.categoryId}</span>
          <span className="tabular-nums text-[var(--color-mute)]">
            {delta.rankBefore} → {delta.rankAfter}
          </span>
        </div>
      ))}
    </div>
  </div>
)

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
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <ImpactColumn impact={suggestion.you} title="Your rank changes" />
        <ImpactColumn impact={suggestion.them} title={`${counterparty} rank changes`} />
      </div>
      <ul className="mt-6 space-y-1 text-[0.8125rem] text-[var(--color-mute)]">
        {suggestion.reasons.map((reason) => (
          <li key={reason}>• {reason}</li>
        ))}
      </ul>
    </section>
  )
}
