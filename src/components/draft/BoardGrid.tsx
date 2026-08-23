import { overallForTeamRound } from "@/lib/domain/snake"
import type { LeagueState } from "@/lib/domain/types"
import {
  teamPastelCellClass,
  teamPastelHeaderClass,
} from "@/lib/draft/teamColors"

type BoardGridProps = {
  label?: string
  state: LeagueState
}

export const BoardGrid = ({
  label = "Live draft",
  state,
}: BoardGridProps) => {
  const playerNames = new Map(
    state.players.map((player) => [player.id, player.name]),
  )
  const picksByOverall = new Map(
    state.board.picks.map((pick) => [pick.overall, pick]),
  )
  const teams = state.settings.teams
  const rounds = state.settings.rounds
  const teamIndexes = Array.from({ length: teams }, (_, index) => index)
  const roundNumbers = Array.from({ length: rounds }, (_, index) => index + 1)

  return (
    <section
      className="min-w-0 rounded-[2rem] border border-[var(--color-hairline)] p-4 sm:p-5"
      aria-labelledby="draft-board-heading"
    >
      <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
        {label}
      </p>
      <h2 className="mt-1 text-xl font-semibold sm:text-2xl" id="draft-board-heading">
        Draft board
      </h2>
      <p className="mt-1 text-[0.7rem] text-[var(--color-mute)]">
        Snake layout — columns are teams, rows reverse each even round
      </p>
      <div className="mt-4 overflow-x-auto pb-2">
        <table className="w-max min-w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--color-canvas)] px-2 py-1.5 text-[0.65rem] font-medium text-[var(--color-mute)]">
                Rd
              </th>
              {teamIndexes.map((teamIndex) => (
                <th
                  className={`px-1.5 py-1.5 text-[0.65rem] font-medium ${teamPastelHeaderClass(teamIndex)} ${
                    teamIndex === state.perspectiveTeamIndex
                      ? "underline decoration-from-font underline-offset-2"
                      : ""
                  }`}
                  key={teamIndex}
                >
                  T{teamIndex + 1}
                  {teamIndex === state.perspectiveTeamIndex ? " · You" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roundNumbers.map((round) => (
              <tr key={round}>
                <th className="sticky left-0 z-10 bg-[var(--color-canvas)] px-2 py-1 text-[0.65rem] font-medium text-[var(--color-mute)]">
                  {round}
                </th>
                {teamIndexes.map((teamIndex) => {
                  const overall = overallForTeamRound(round, teamIndex, teams)
                  const pick = picksByOverall.get(overall)
                  const playerName = pick?.playerId
                    ? playerNames.get(pick.playerId) ?? "?"
                    : "—"
                  const isCurrent = overall === state.board.currentOverall
                  const isYou = teamIndex === state.perspectiveTeamIndex

                  return (
                    <td className="p-0.5" key={`${round}-${teamIndex}`}>
                      <div
                        className={`min-h-[3.25rem] w-[5.75rem] rounded-lg border px-1.5 py-1 ${teamPastelCellClass(teamIndex)} ${
                          isCurrent
                            ? "ring-2 ring-[var(--color-ink)] ring-offset-1"
                            : isYou
                              ? "border-[var(--color-ink)]/40"
                              : ""
                        }`}
                      >
                        <p className="text-[0.6rem] tabular-nums text-[var(--color-mute)]">
                          #{overall}
                        </p>
                        <p className="mt-0.5 break-words text-[0.7rem] font-medium leading-tight">
                          {playerName}
                        </p>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
