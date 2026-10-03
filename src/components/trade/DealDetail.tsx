import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState } from "@/lib/season/types"
import type { CategoryTotalMove } from "@/lib/trade/accept"
import { formatTotal, formatValueLine } from "@/lib/trade/offerCopy"
import { replacementScaledValues } from "@/lib/trade/score"
import type { TradeSuggestion } from "@/lib/trade/types"
import { buildPlayerValueMap } from "@/lib/trade/value"

type DealDetailProps = {
  suggestion: TradeSuggestion
  state: SeasonLeagueState
}

const playerNames = (playerIds: string[], state: SeasonLeagueState) =>
  playerIds.map((playerId) =>
    state.players.find((player) => player.id === playerId)?.name ?? "Unknown player",
  ).join(" + ")

const packageValue = (playerIds: string[], values: Map<string, number>) =>
  playerIds.reduce((sum, playerId) => sum + (values.get(playerId) ?? 0), 0)

const SideGains = ({
  title,
  gains,
  strengthsHeld,
}: {
  title: string
  gains: CategoryTotalMove[]
  strengthsHeld: CategoryId[]
}) => (
  <div>
    <h3 className="text-sm font-semibold">{title}</h3>
    {gains.map((gain) => (
      <div
        className="mt-2 flex items-center justify-between gap-4 border-y border-[var(--color-hairline)] py-2 text-[0.8125rem]"
        key={gain.categoryId}
      >
        <span className="font-medium">{gain.categoryId}</span>
        <span className="tabular-nums text-[var(--color-mute)]">
          {formatTotal(gain.categoryId, gain.before)} →{" "}
          {formatTotal(gain.categoryId, gain.after)}
        </span>
      </div>
    ))}
    {strengthsHeld.length ? (
      <p className="mt-2 text-[0.8125rem] text-[var(--color-mute)]">
        Stays strong in {strengthsHeld.join(", ")}
      </p>
    ) : null}
  </div>
)

const WorsenedMoves = ({
  teamLabel,
  moves,
}: {
  teamLabel: string
  moves: CategoryTotalMove[]
}) => (
  <>
    {moves.map((move) => (
      <li key={`${teamLabel}-${move.categoryId}`}>
        {teamLabel}: {move.categoryId} was already below average and moves from{" "}
        {formatTotal(move.categoryId, move.before)} to{" "}
        {formatTotal(move.categoryId, move.after)}
      </li>
    ))}
  </>
)

export const DealDetail = ({ suggestion, state }: DealDetailProps) => {
  const giveNames = playerNames(suggestion.givePlayerIds, state)
  const getNames = playerNames(suggestion.getPlayerIds, state)
  const counterparty = state.teams.find(
    (team) => team.teamIndex === suggestion.counterpartyTeamIndex,
  )?.name ?? `Team ${suggestion.counterpartyTeamIndex + 1}`
  const values = replacementScaledValues(buildPlayerValueMap(state))
  const giveLarger =
    packageValue(suggestion.givePlayerIds, values)
    > packageValue(suggestion.getPlayerIds, values)
  const hasWorsened =
    suggestion.themWorsened.length > 0 || suggestion.youWorsened.length > 0

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
      <div className="mt-6 space-y-4">
        <SideGains
          gains={suggestion.themGains}
          strengthsHeld={suggestion.themStrengthsHeld}
          title="What they get"
        />
        <SideGains
          gains={suggestion.youGains}
          strengthsHeld={suggestion.youStrengthsHeld}
          title="What you get"
        />
      </div>
      <p className="mt-4 text-[0.8125rem] font-medium">
        {formatValueLine({
          giveLarger,
          valueGap: suggestion.valueGap,
          overpayRatio: suggestion.overpayRatio,
        })}
      </p>
      {hasWorsened ? (
        <ul className="mt-4 space-y-1 text-[0.8125rem] text-[var(--color-mute)]">
          <WorsenedMoves moves={suggestion.themWorsened} teamLabel={counterparty} />
          <WorsenedMoves moves={suggestion.youWorsened} teamLabel="You" />
        </ul>
      ) : null}
      <ul className="mt-6 space-y-1 text-[0.8125rem] text-[var(--color-mute)]">
        {suggestion.reasons.map((reason) => (
          <li key={reason}>• {reason}</li>
        ))}
      </ul>
    </section>
  )
}
