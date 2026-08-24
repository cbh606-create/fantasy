import Link from "next/link"
import { formatPlayerPositions } from "@/lib/season/slotLabels"
import type { SeasonPlayer } from "@/lib/season/types"
import type {
  StreamingPlan,
  StreamingPlanAction,
} from "@/lib/matchup/types"

type StreamingPlansPanelProps = {
  leagueId: string
  plans: StreamingPlan[]
  playersById: Record<string, SeasonPlayer>
}

const formatDayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
}

const actionLabel = (action: StreamingPlanAction): string => {
  switch (action) {
    case "hold":
      return "Hold"
    case "add":
      return "Add"
    case "drop_add":
      return "Drop→Add"
    case "empty":
      return "—"
  }
}

const isAddAction = (action: StreamingPlanAction) =>
  action === "add" || action === "drop_add"

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
      {plans.map((plan) => (
        <div key={plan.spotCount}>
          <h3 className="text-[0.8125rem] font-semibold">
            {plan.spotCount}-spot
          </h3>
          <p className="mt-0.5 text-[0.75rem] text-[var(--color-mute)]">
            Adds {plan.addsUsed}/{plan.addLimit} · {plan.gameStarts} starts
          </p>

          {plan.days.length > 0 ? (
            <table className="mt-2 w-full border-collapse text-left text-[0.75rem] leading-snug">
              <tbody>
                {plan.days.map((day) => (
                  <tr
                    className="border-t border-[var(--color-hairline)]"
                    key={day.date}
                  >
                    <th
                      className="w-[5.5rem] py-1.5 pr-2 font-medium text-[var(--color-mute)]"
                      scope="row"
                    >
                      {formatDayLabel(day.date)}
                    </th>
                    {day.cells.map((cell) => {
                      const player = cell.playerId
                        ? playersById[cell.playerId]
                        : undefined
                      const name = player?.name ?? "—"
                      const positions = formatPlayerPositions(player)
                      const team = player?.teamAbbr
                      const label = actionLabel(cell.action)
                      const linkAdd =
                        isAddAction(cell.action) && cell.playerId

                      return (
                        <td
                          className="py-1.5 pr-3 align-top"
                          key={`${day.date}-${cell.spotIndex}`}
                        >
                          {cell.action === "empty" || !cell.playerId ? (
                            <span className="text-[var(--color-mute)]">—</span>
                          ) : (
                            <span>
                              {linkAdd ? (
                                <Link
                                  className="font-medium text-[var(--color-ink)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                                  href={`/waivers/${leagueId}?addPlayerId=${cell.playerId}`}
                                >
                                  {name}
                                </Link>
                              ) : (
                                <span className="font-medium">{name}</span>
                              )}
                              <span className="ml-1 text-[var(--color-mute)]">
                                {positions}
                                {team ? ` · ${team}` : ""}
                              </span>
                              <span className="ml-1.5 text-[var(--color-mute)]">
                                {label}
                              </span>
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ))}
    </div>
  </section>
)
