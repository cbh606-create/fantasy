import type { SeasonPlayer, SeasonRosterEntry } from "@/lib/season/types"
import { eligibleRosterDropPlayerIds } from "@/lib/matchup/streamingDropOptions"
import type {
  YouSpotCount,
  YouSpotScore,
} from "@/lib/matchup/recommendYouSpot"
import type { OppSpotScore } from "@/lib/matchup/scoreOppSpot"
import type { OppSpotChoice, StatWindow } from "@/lib/matchup/types"
import { isStatWindow } from "@/lib/matchup/types"

const YOU_OPTIONS: { id: 1 | 2 | 3 | null; label: string }[] = [
  { id: null, label: "None" },
  { id: 1, label: "1-spot" },
  { id: 2, label: "2-spot" },
  { id: 3, label: "3-spot" },
]

const OPP_SPOTS = [0, 1, 2, 3] as const

const choiceButtonClass = (pressed: boolean) =>
  pressed
    ? "rounded-full border border-[var(--color-ink)] px-2 py-0.5 text-center font-medium whitespace-nowrap text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
    : "rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-center font-medium whitespace-nowrap text-[var(--color-mute)] transition-colors hover:bg-[var(--color-soft-cloud)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

const selectClass =
  "min-w-[7.5rem] rounded-full border border-[var(--color-hairline)] bg-transparent px-2 py-0.5 font-medium text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"

const selectIdleClass =
  "min-w-[7.5rem] rounded-full border border-[var(--color-hairline)] bg-[var(--color-soft-cloud)] px-2 py-0.5 font-medium text-[var(--color-mute)] opacity-60"

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
        const winsLabel =
          score == null ? "" : score.projectedCatWins.toFixed(2)
        const visible = [
          option.label,
          isRecommended ? "Rec" : null,
          winsLabel ? `· ${winsLabel}` : null,
        ]
          .filter(Boolean)
          .join(" ")
        const ariaLabel = [
          option.id == null ? "You none" : `You ${option.id}-spot`,
          isRecommended ? "recommended" : null,
          winsLabel,
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
  oppSpotChoice,
  onOppSpotChoiceChange,
  onYouSpotCountChange,
  youSpotCount,
  recommendedYouSpot,
  youSpotScores,
  oppSpotScores,
  statWindow,
  onStatWindowChange,
  resolvedOppSpotCount,
  forcedOpponentRosterDrops,
  onForcedOpponentRosterDropChange,
  opponentEntries,
  playersById,
}: {
  oppSpotChoice: OppSpotChoice
  onOppSpotChoiceChange: (choice: OppSpotChoice) => void
  onYouSpotCountChange: (spot: YouSpotCount) => void
  youSpotCount: YouSpotCount
  recommendedYouSpot?: YouSpotCount
  youSpotScores?: YouSpotScore[]
  oppSpotScores?: OppSpotScore[]
  statWindow: StatWindow
  onStatWindowChange: (window: StatWindow) => void
  resolvedOppSpotCount?: 0 | 1 | 2 | 3
  forcedOpponentRosterDrops?: (string | null)[]
  onForcedOpponentRosterDropChange?: (spotIndex: number, playerId: string | null) => void
  opponentEntries?: SeasonRosterEntry[]
  playersById?: Record<string, SeasonPlayer>
}) => {
  const handleStatWindowChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = event.target.value
    if (isStatWindow(value)) onStatWindowChange(value)
  }

  const oppDropCount = Math.max(resolvedOppSpotCount ?? 0, 1)
  const oppDropsIdle = !resolvedOppSpotCount

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
          {OPP_SPOTS.map((choice) => {
            const handleOppClick = () => {
              onOppSpotChoiceChange(choice)
            }
            const score = oppSpotScores?.find((entry) => entry.spot === choice)
            const startsLabel = score == null ? "" : String(score.gameStarts)
            const visible = [
              `${choice}-spot`,
              startsLabel ? `· ${startsLabel}` : null,
            ]
              .filter(Boolean)
              .join(" ")
            const ariaLabel = [
              `Opp ${choice}-spot`,
              startsLabel || null,
            ]
              .filter(Boolean)
              .join(" ")
            return (
              <button
                aria-label={ariaLabel}
                aria-pressed={oppSpotChoice === choice}
                className={choiceButtonClass(oppSpotChoice === choice)}
                key={choice}
                onClick={handleOppClick}
                type="button"
              >
                {visible}
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
          <option value="projection">Projection</option>
          <option value="l7">Last 7 days</option>
          <option value="l15">Last 15 days</option>
          <option value="l30">Last 30 days</option>
        </select>
      </label>
      <div
        aria-disabled={oppDropsIdle || undefined}
        className={`flex min-w-0 flex-col gap-1${oppDropsIdle ? " opacity-60" : ""}`}
      >
        <span className="text-[var(--color-mute)]">Opp drop</span>
        {Array.from({ length: oppDropCount }, (_, spotIndex) => {
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
            if (oppDropsIdle) return
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
                className={oppDropsIdle ? selectIdleClass : selectClass}
                disabled={oppDropsIdle}
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
    </aside>
  )
}
