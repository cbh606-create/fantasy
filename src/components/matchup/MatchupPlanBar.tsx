import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { eligibleRosterDropPlayerIds } from "@/lib/matchup/streamingDropOptions"
import type {
  YouSpotCount,
  YouSpotScore,
} from "@/lib/matchup/recommendYouSpot"
import type { OppSpotChoice, StatWindow } from "@/lib/matchup/types"
import { isStatWindow } from "@/lib/matchup/types"

const YOU_OPTIONS: { id: 1 | 2 | 3 | null; label: string }[] = [
  { id: null, label: "None" },
  { id: 1, label: "1-spot" },
  { id: 2, label: "2-spot" },
  { id: 3, label: "3-spot" },
]

const OPP_SPOTS = [1, 2, 3] as const

const choiceButtonClass = (pressed: boolean) =>
  pressed
    ? "rounded-full border border-[var(--color-ink)] px-2 py-0.5 text-center font-medium whitespace-nowrap text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
    : "rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-center font-medium whitespace-nowrap text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

const selectClass =
  "min-w-[7.5rem] rounded-full border border-[var(--color-hairline)] bg-transparent px-2 py-0.5 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

export const YouSpotToggle = ({
  onYouSpotCountChange,
  youSpotCount,
  recommendedYouSpot,
  youSpotScores,
}: {
  onYouSpotCountChange: (spot: YouSpotCount) => void
  youSpotCount: YouSpotCount
  recommendedYouSpot?: YouSpotCount
  youSpotScores?: YouSpotScore[]
}) => (
  <div
    aria-label="You streaming spots"
    className="flex min-w-0 flex-col gap-1"
  >
    <span className="text-[var(--color-mute)]">You</span>
    <div className="grid grid-cols-2 gap-1">
      {YOU_OPTIONS.map((option) => {
        const handleYouClick = () => {
          onYouSpotCountChange(option.id)
        }
        const score = youSpotScores?.find((entry) => entry.spot === option.id)
        const isRecommended =
          recommendedYouSpot !== undefined && recommendedYouSpot === option.id
        const startsLabel = score == null ? "" : String(score.gameStarts)
        const visible = [
          option.label,
          isRecommended ? "Rec" : null,
          startsLabel ? `· ${startsLabel}` : null,
        ]
          .filter(Boolean)
          .join(" ")
        const ariaLabel = [
          option.id == null ? "You none" : `You ${option.id}-spot`,
          isRecommended ? "recommended" : null,
          startsLabel,
        ]
          .filter(Boolean)
          .join(" ")
        return (
          <button
            aria-label={ariaLabel}
            aria-pressed={youSpotCount === option.id}
            className={choiceButtonClass(youSpotCount === option.id)}
            key={option.label}
            onClick={handleYouClick}
            type="button"
          >
            {visible}
          </button>
        )
      })}
    </div>
  </div>
)

export const MatchupPlanBar = ({
  openSeatCount,
  oppSpotChoice,
  onOppSpotChoiceChange,
  onYouSpotCountChange,
  youSpotCount,
  recommendedYouSpot,
  youSpotScores,
  statWindow,
  onStatWindowChange,
  resolvedOppSpotCount,
  forcedOpponentRosterDrops,
  onForcedOpponentRosterDropChange,
  opponentEntries,
  playersById,
}: {
  openSeatCount: number
  oppSpotChoice: OppSpotChoice
  onOppSpotChoiceChange: (choice: OppSpotChoice) => void
  onYouSpotCountChange: (spot: YouSpotCount) => void
  youSpotCount: YouSpotCount
  recommendedYouSpot?: YouSpotCount
  youSpotScores?: YouSpotScore[]
  statWindow: StatWindow
  onStatWindowChange: (window: StatWindow) => void
  resolvedOppSpotCount?: 1 | 2 | 3
  forcedOpponentRosterDrops?: (string | null)[]
  onForcedOpponentRosterDropChange?: (spotIndex: number, playerId: string | null) => void
  opponentEntries?: SeasonRosterEntry[]
  playersById?: Record<string, SeasonPlayer>
}) => {
  const handleAutoClick = () => {
    onOppSpotChoiceChange("auto")
  }

  const handleStatWindowChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = event.target.value
    if (isStatWindow(value)) onStatWindowChange(value)
  }

  return (
    <aside
      aria-label="Matchup plans"
      className="flex shrink-0 flex-row flex-wrap items-start gap-x-3 gap-y-2 text-[0.8125rem]"
    >
      <YouSpotToggle
        onYouSpotCountChange={onYouSpotCountChange}
        recommendedYouSpot={recommendedYouSpot}
        youSpotCount={youSpotCount}
        youSpotScores={youSpotScores}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[var(--color-mute)]">Opp</span>
        <div className="grid grid-cols-2 gap-1">
          <button
            aria-pressed={oppSpotChoice === "auto"}
            className={choiceButtonClass(oppSpotChoice === "auto")}
            onClick={handleAutoClick}
            type="button"
          >
            {`Auto · ${openSeatCount}`}
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
                {`${choice}-spot`}
              </button>
            )
          })}
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[var(--color-mute)]">Stats</span>
        <select
          aria-label="Stat window"
          className={selectClass}
          onChange={handleStatWindowChange}
          value={statWindow}
        >
          <option value="season">Season</option>
          <option value="l7">Last 7 days</option>
          <option value="l15">Last 15 days</option>
          <option value="l30">Last 30 days</option>
        </select>
      </label>
      {resolvedOppSpotCount ? (
        <div className="flex min-w-0 flex-col gap-1">
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
              <label className="flex flex-col gap-0.5" key={spotIndex}>
                <span className="sr-only">{`Opp drop spot ${spotIndex + 1}`}</span>
                <select
                  aria-label={`Opp drop spot ${spotIndex + 1}`}
                  className={selectClass}
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
    </aside>
  )
}
