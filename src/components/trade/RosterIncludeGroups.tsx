import type { SeasonLeagueState } from "@/lib/season/types"

type RosterIncludeGroupsProps = {
  state: SeasonLeagueState
  excludedIds: string[]
  onExclude: (playerId: string) => void
  onInclude: (playerId: string) => void
}

const playerName = (state: SeasonLeagueState, playerId: string) =>
  state.players.find((player) => player.id === playerId)?.name ?? "Unknown player"

export const RosterIncludeGroups = ({
  state,
  excludedIds,
  onExclude,
  onInclude,
}: RosterIncludeGroupsProps) => {
  const excluded = new Set(excludedIds)
  const playerIds = state.teams
    .find((team) => team.teamIndex === state.perspectiveTeamIndex)
    ?.entries.flatMap((entry) =>
      entry.slot === "IL" || !entry.playerId ? [] : [entry.playerId]) ?? []
  const includedIds = playerIds.filter((playerId) => !excluded.has(playerId))
  const excludedPlayerIds = playerIds.filter((playerId) => excluded.has(playerId))

  const renderGroup = (
    title: "Include" | "Do Not Include",
    ids: string[],
    actionLabel: "Do Not Include" | "Include",
    onAction: (playerId: string) => void,
  ) => (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2">
        {ids.map((playerId) => (
          <li className="flex items-center justify-between gap-3 text-sm" key={playerId}>
            <span>{playerName(state, playerId)}</span>
            <button
              className="rounded-full border border-[var(--color-hairline)] px-3 py-1"
              onClick={() => onAction(playerId)}
              type="button"
            >
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Your roster</h2>
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        {renderGroup("Include", includedIds, "Do Not Include", onExclude)}
        {renderGroup("Do Not Include", excludedPlayerIds, "Include", onInclude)}
      </div>
    </section>
  )
}
