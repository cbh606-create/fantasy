import type { SeasonLeagueState } from "@/lib/season/types"

type RosterIncludeGroupsProps = {
  state: SeasonLeagueState
  excludedIds: string[]
  onExclude: (playerId: string) => void
  onInclude: (playerId: string) => void
}

const playerName = (state: SeasonLeagueState, playerId: string) =>
  state.players.find((player) => player.id === playerId)?.name ?? "Unknown player"

export const tradableRosterPlayerIds = (state: SeasonLeagueState) =>
  state.teams
    .find((team) => team.teamIndex === state.perspectiveTeamIndex)
    ?.entries.flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId]) ?? []

export const RosterIncludeGroups = ({
  state,
  excludedIds,
  onExclude,
  onInclude,
}: RosterIncludeGroupsProps) => {
  const excluded = new Set(excludedIds)
  const playerIds = tradableRosterPlayerIds(state)

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Your roster</h2>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-mute)]">
        <span className="rounded-full bg-[var(--color-ink)] px-2.5 py-0.5 text-xs font-medium text-white">
          Include
        </span>
        <span>can be traded</span>
        <span className="rounded-full border border-[var(--color-hairline)] bg-white px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)]">
          Hold
        </span>
        <span>stays on your roster</span>
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {playerIds.map((playerId) => {
          const name = playerName(state, playerId)
          const included = !excluded.has(playerId)

          return (
            <li key={playerId}>
              <button
                aria-pressed={included}
                className={
                  included
                    ? "rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-full border border-[var(--color-hairline)] bg-white px-3 py-1.5 text-sm font-medium"
                }
                onClick={() => included ? onExclude(playerId) : onInclude(playerId)}
                type="button"
              >
                {name}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
