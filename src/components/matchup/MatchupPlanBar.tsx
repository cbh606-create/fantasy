import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { eligibleRosterDropPlayerIds } from "@/lib/matchup/streamingDropOptions"
import type { OppSpotChoice } from "@/lib/matchup/types"

const YOU_OPTIONS: { id: 1 | 2 | 3 | null; label: string }[] = [
  { id: null, label: "None" },
  { id: 1, label: "1-spot" },
  { id: 2, label: "2-spot" },
  { id: 3, label: "3-spot" },
]

const OPP_SPOTS = [1, 2, 3] as const

const choiceButtonClass = (pressed: boolean) =>
  pressed
    ? "rounded-full border border-[var(--color-ink)] px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
    : "rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-medium text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

export const MatchupPlanBar = ({
  openSeatCount,
  oppSpotChoice,
  onOppSpotChoiceChange,
  onYouSpotCountChange,
  youSpotCount,
  resolvedOppSpotCount,
  forcedOpponentRosterDrops,
  onForcedOpponentRosterDropChange,
  opponentEntries,
  playersById,
}: {
  openSeatCount: number
  oppSpotChoice: OppSpotChoice
  onOppSpotChoiceChange: (choice: OppSpotChoice) => void
  onYouSpotCountChange: (spot: 1 | 2 | 3 | null) => void
  youSpotCount: 1 | 2 | 3 | null
  resolvedOppSpotCount?: 1 | 2 | 3
  forcedOpponentRosterDrops?: (string | null)[]
  onForcedOpponentRosterDropChange?: (spotIndex: number, playerId: string | null) => void
  opponentEntries?: SeasonRosterEntry[]
  playersById?: Record<string, SeasonPlayer>
}) => {
  const handleAutoClick = () => {
    onOppSpotChoiceChange("auto")
  }

  return (
    <div
      aria-label="Matchup plans"
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8125rem]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--color-mute)]">You</span>
        {YOU_OPTIONS.map((option) => {
          const handleYouClick = () => {
            onYouSpotCountChange(option.id)
          }
          return (
            <button
              aria-label={
                option.id == null ? "You none" : `You ${option.id}-spot`
              }
              aria-pressed={youSpotCount === option.id}
              className={choiceButtonClass(youSpotCount === option.id)}
              key={option.label}
              onClick={handleYouClick}
              type="button"
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--color-mute)]">Opp spots</span>
        <button
          aria-pressed={oppSpotChoice === "auto"}
          className={choiceButtonClass(oppSpotChoice === "auto")}
          onClick={handleAutoClick}
          type="button"
        >
          {`Auto · ${openSeatCount} open`}
        </button>
        {OPP_SPOTS.map((choice) => {
          const handleOppClick = () => {
            onOppSpotChoiceChange(choice)
          }
          return (
            <button
              aria-label={`Opp ${choice}-spot`}
              aria-pressed={oppSpotChoice === choice}
              className={choiceButtonClass(oppSpotChoice === choice)}
              key={choice}
              onClick={handleOppClick}
              type="button"
            >
              {choice}
            </button>
          )
        })}
      </div>
      {resolvedOppSpotCount ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--color-mute)]">Opp drop</span>
          {Array.from({ length: resolvedOppSpotCount }, (_, spotIndex) => {
            const earlier = (forcedOpponentRosterDrops ?? [])
              .slice(0, spotIndex)
              .filter((id): id is string => Boolean(id))
            const eligible = eligibleRosterDropPlayerIds(
              opponentEntries ?? [],
              playersById ?? {},
              earlier,
            )
            const selected = forcedOpponentRosterDrops?.[spotIndex] ?? null
            const selectValue =
              selected && eligible.includes(selected) ? selected : ""
            const handleOppDropChange = (
              event: React.ChangeEvent<HTMLSelectElement>,
            ) => {
              const value = event.target.value
              onForcedOpponentRosterDropChange?.(
                spotIndex,
                value === "" ? null : value,
              )
            }
            return (
              <label
                className="flex items-center gap-1"
                key={spotIndex}
              >
                <span className="sr-only">{`Opp drop spot ${spotIndex + 1}`}</span>
                <select
                  aria-label={`Opp drop spot ${spotIndex + 1}`}
                  className="rounded-full border border-[var(--color-hairline)] bg-transparent px-2.5 py-1 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                  onChange={handleOppDropChange}
                  value={selectValue}
                >
                  <option value="">Auto</option>
                  {eligible.map((playerId) => (
                    <option key={playerId} value={playerId}>
                      {playersById?.[playerId]?.name ?? playerId}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
