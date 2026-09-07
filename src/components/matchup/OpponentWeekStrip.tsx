import { MATCHUP_WEEK_DAY_COL_CLASS } from "@/lib/matchup/weekCalendarLayout"
import type { OpponentStreamDay, OppSpotChoice } from "@/lib/matchup/types"
import type { SeasonPlayer } from "@/lib/season/types"

const SPOT_CHOICES = [1, 2, 3] as const

const formatOppDayAria = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" })
  const monthDay = date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  })
  return `${weekday} ${monthDay}`
}

const streamerLabel = (
  playerId: string | null | undefined,
  playersById: Record<string, SeasonPlayer>,
) => {
  if (!playerId) return "—"
  return playersById[playerId]?.name ?? "—"
}

const choiceButtonClass = (pressed: boolean) =>
  pressed
    ? "rounded-full border border-[var(--color-ink)] px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
    : "rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

export const OpponentWeekStrip = ({
  days,
  opponentName,
  opponentDays,
  openSeatCount,
  oppSpotChoice,
  onOppSpotChoiceChange,
  playersById,
}: {
  days: string[]
  opponentName: string
  opponentDays: OpponentStreamDay[]
  openSeatCount: number
  oppSpotChoice: OppSpotChoice
  onOppSpotChoiceChange: (choice: OppSpotChoice) => void
  playersById: Record<string, SeasonPlayer>
}) => {
  const handleAutoClick = () => {
    onOppSpotChoiceChange("auto")
  }

  const dayByDate = Object.fromEntries(
    opponentDays.map((day) => [day.date, day]),
  )

  return (
    <section
      aria-label="Opponent week"
      className="mt-3 overflow-x-auto"
    >
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-[0.8125rem] font-medium text-[var(--color-ink)]">
          {opponentName}
        </p>
        <div className="flex min-w-0 flex-1">
          {days.map((day) => {
            const oppDay = dayByDate[day]
            const games = oppDay?.rosterGameCount ?? 0
            const name = streamerLabel(oppDay?.streamerPlayerId, playersById)
            return (
              <div
                aria-label={`Opp ${formatOppDayAria(day)}: ${games} games, ${name}`}
                className={`${MATCHUP_WEEK_DAY_COL_CLASS} px-1 py-1`}
                key={day}
                role="group"
              >
                <p className="tabular-nums text-[0.8125rem] text-[var(--color-ink)]">
                  {games}
                </p>
                <p className="truncate text-[0.7rem] text-[var(--color-mute)]">
                  {name}
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[0.8125rem]">
          <span className="text-[var(--color-mute)]">Opp spots</span>
          <button
            aria-pressed={oppSpotChoice === "auto"}
            className={choiceButtonClass(oppSpotChoice === "auto")}
            onClick={handleAutoClick}
            type="button"
          >
            {`Auto · ${openSeatCount} open`}
          </button>
          {SPOT_CHOICES.map((choice) => {
            const handleSpotClick = () => {
              onOppSpotChoiceChange(choice)
            }
            return (
              <button
                aria-pressed={oppSpotChoice === choice}
                className={choiceButtonClass(oppSpotChoice === choice)}
                key={choice}
                onClick={handleSpotClick}
                type="button"
              >
                {choice}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
