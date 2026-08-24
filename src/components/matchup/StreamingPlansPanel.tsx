import Link from "next/link"
import { formatPlayerPositions } from "@/lib/season/slotLabels"
import type { SeasonPlayer } from "@/lib/season/types"
import type {
  StreamingPlan,
  StreamingPlanDayCell,
} from "@/lib/matchup/types"

type StreamingPlansPanelProps = {
  leagueId: string
  plans: StreamingPlan[]
  playersById: Record<string, SeasonPlayer>
}

const formatDayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
}

const playerName = (
  playerId: string | null,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!playerId) return "—"
  return playersById[playerId]?.name ?? "—"
}

const isAddAction = (action: StreamingPlanDayCell["action"]) =>
  action === "add" || action === "drop_add"

const rosterCopy = (
  cell: StreamingPlanDayCell,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!isAddAction(cell.action)) return null
  if (cell.rosterDropKind === "open_slot") return "Roster: open slot"
  if (cell.rosterDropKind === "player") {
    return `Roster: drop ${playerName(cell.rosterDropPlayerId, playersById)}`
  }
  return "Roster: —"
}

const PlanCell = ({
  cell,
  leagueId,
  playersById,
}: {
  cell: StreamingPlanDayCell | undefined
  leagueId: string
  playersById: Record<string, SeasonPlayer>
}) => {
  if (!cell || cell.action === "empty" || (!cell.playerId && !isAddAction(cell.action))) {
    return <span className="text-[var(--color-mute)]">—</span>
  }

  const faName = playerName(cell.playerId, playersById)
  const droppedName = playerName(cell.droppedPlayerId, playersById)
  const seated = cell.playerId ? playersById[cell.playerId] : undefined
  const roster = rosterCopy(cell, playersById)
  const addLink = isAddAction(cell.action) && cell.playerId

  return (
    <div className="flex flex-col gap-0.5">
      {cell.action === "drop_add" ? (
        <div>
          Drop {droppedName}
        </div>
      ) : null}
      {isAddAction(cell.action) ? (
        <div>
          Add{" "}
          {addLink ? (
            <Link
              className="font-medium text-[var(--color-ink)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
              href={`/waivers/${leagueId}?addPlayerId=${cell.playerId}`}
            >
              {faName}
            </Link>
          ) : (
            <span className="font-medium">{faName}</span>
          )}
        </div>
      ) : null}
      {cell.action === "hold" ? (
        <div>
          <span className="font-medium">{faName}</span>
          <span className="ml-1 text-[var(--color-mute)]">
            {formatPlayerPositions(seated)}
            {seated?.teamAbbr ? ` · ${seated.teamAbbr}` : ""}
          </span>
        </div>
      ) : null}
      {roster ? (
        <div className="text-[var(--color-mute)]">{roster}</div>
      ) : null}
    </div>
  )
}

export const StreamingPlansPanel = ({
  leagueId,
  plans,
  playersById,
}: StreamingPlansPanelProps) => (
  <section>
    <h2 className="text-lg font-semibold">Streaming plans</h2>
    <p className="mt-1 text-[0.8125rem] text-[var(--color-mute)]">
      Weekly add budget 7; drops are free.
    </p>

    <div className="mt-3 space-y-5">
      {plans.map((plan) => {
        const dates = plan.days.map((day) => day.date)

        return (
          <div key={plan.spotCount}>
            <h3 className="text-[0.8125rem] font-semibold">
              {plan.spotCount}-spot
            </h3>
            <p className="mt-0.5 text-[0.75rem] text-[var(--color-mute)]">
              Adds {plan.addsUsed}/{plan.addLimit} · {plan.gameStarts} starts
            </p>

            {dates.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[0.75rem] leading-snug">
                  <thead>
                    <tr className="border-t border-[var(--color-hairline)]">
                      <th
                        className="w-[4.5rem] py-1.5 pr-2 font-medium text-[var(--color-mute)]"
                        scope="col"
                      >
                        Spot
                      </th>
                      {dates.map((date) => (
                        <th
                          className="min-w-[5.5rem] py-1.5 pr-3 font-medium text-[var(--color-mute)]"
                          key={date}
                          scope="col"
                        >
                          {formatDayLabel(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: plan.spotCount }, (_, spotIndex) => (
                      <tr
                        className="border-t border-[var(--color-hairline)]"
                        key={spotIndex}
                      >
                        <th
                          className="py-1.5 pr-2 font-medium text-[var(--color-mute)]"
                          scope="row"
                        >
                          Spot {spotIndex + 1}
                        </th>
                        {dates.map((date) => {
                          const cell = plan.days
                            .find((day) => day.date === date)
                            ?.cells.find((c) => c.spotIndex === spotIndex)

                          return (
                            <td
                              className="py-1.5 pr-3 align-top"
                              key={`${date}-${spotIndex}`}
                            >
                              <PlanCell
                                cell={cell}
                                leagueId={leagueId}
                                playersById={playersById}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  </section>
)
