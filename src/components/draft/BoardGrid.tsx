import type { LeagueState } from "@/lib/domain/types"

type BoardGridProps = {
  state: LeagueState
}

export const BoardGrid = ({ state }: BoardGridProps) => {
  const playerNames = new Map(
    state.players.map((player) => [player.id, player.name]),
  )
  const picksByOverall = new Map(
    state.board.picks.map((pick) => [pick.overall, pick]),
  )
  const totalPicks = state.settings.teams * state.settings.rounds
  const pickNumbers = Array.from(
    { length: totalPicks },
    (_, index) => index + 1,
  )

  return (
    <section
      className="min-w-0 rounded-[2rem] border border-[var(--color-hairline)] p-5 sm:p-7"
      aria-labelledby="draft-board-heading"
    >
      <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
        Live draft
      </p>
      <h2 className="mt-2 text-3xl font-semibold" id="draft-board-heading">
        Draft board
      </h2>
      <div className="mt-6 overflow-x-auto pb-2">
        <div className="grid min-w-[58rem] grid-cols-12 gap-2">
          {pickNumbers.map((overall) => {
            const pick = picksByOverall.get(overall)
            const round = Math.ceil(overall / state.settings.teams)
            const teamIndex =
              pick?.teamIndex ??
              (round % 2 === 1
                ? (overall - 1) % state.settings.teams
                : state.settings.teams - 1 - ((overall - 1) % state.settings.teams))
            const playerName = pick?.playerId
              ? playerNames.get(pick.playerId) ?? "Unknown player"
              : "Available"
            const isCurrent = overall === state.board.currentOverall

            return (
              <div
                className={`min-h-24 rounded-2xl border p-3 ${
                  isCurrent
                    ? "border-[var(--color-ink)] bg-[var(--color-soft-cloud)]"
                    : "border-[var(--color-hairline)]"
                }`}
                key={overall}
              >
                <p className="text-xs tabular-nums text-[var(--color-mute)]">
                  {overall} · Team {teamIndex + 1}
                </p>
                <p className="mt-2 text-sm font-medium">{playerName}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
