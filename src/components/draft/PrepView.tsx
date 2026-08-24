import { Button } from "@/components/ui/Button"
import { RecPanel } from "@/components/draft/RecPanel"
import type {
  CategoryId,
  LeagueState,
  SimulationResult,
} from "@/lib/domain/types"

const CATEGORY_LABELS: Record<CategoryId, string> = {
  FG_PCT: "FG%",
  FT_PCT: "FT%",
  TPM: "3PM",
  REB: "REB",
  AST: "AST",
  STL: "STL",
  BLK: "BLK",
  TO: "TO",
  PTS: "PTS",
}

type PrepViewProps = {
  isSimulating: boolean
  onRunSimulation: () => void
  onSimCountChange: (simCount: number) => void
  result: SimulationResult | null
  simCount: number
  state: LeagueState
}

export const PrepView = ({
  isSimulating,
  onRunSimulation,
  onSimCountChange,
  result,
  simCount,
  state,
}: PrepViewProps) => {
  const playerNames = new Map(
    state.players.map((player) => [player.id, player.name]),
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)_22rem]">
      <aside className="rounded-[2rem] border border-[var(--color-hairline)] p-6">
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Draft goals
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Your strategy</h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {state.settings.focusCategoryIds.map((categoryId) => (
            <span
              className="rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-sm text-white"
              key={categoryId}
            >
              Focus {CATEGORY_LABELS[categoryId]}
            </span>
          ))}
          {state.settings.puntCategoryIds.map((categoryId) => (
            <span
              className="rounded-full bg-[var(--color-soft-cloud)] px-3 py-1.5 text-sm"
              key={categoryId}
            >
              Punt {CATEGORY_LABELS[categoryId]}
            </span>
          ))}
          {!state.settings.focusCategoryIds.length &&
          !state.settings.puntCategoryIds.length ? (
            <span className="text-sm text-[var(--color-mute)]">
              Balanced category strategy
            </span>
          ) : null}
        </div>
        <p className="mt-5 text-sm text-[var(--color-mute)]">
          {state.settings.teams}-team · pick slot {state.settings.userPickSlot} ·{" "}
          {state.settings.rounds} rounds
        </p>

        <label className="mt-8 block space-y-2 text-sm font-medium">
          <span>Simulation count</span>
          <input
            className="h-12 w-full rounded-full bg-[var(--color-soft-cloud)] px-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]"
            max="100"
            min="1"
            onChange={(event) => onSimCountChange(Number(event.target.value))}
            type="number"
            value={simCount}
          />
        </label>
        <Button
          className="mt-4 w-full"
          disabled={isSimulating || simCount < 1 || simCount > 100}
          onClick={onRunSimulation}
        >
          {isSimulating ? "Simulating…" : "Run simulation"}
        </Button>
      </aside>

      <section
        className="rounded-[2rem] border border-[var(--color-hairline)] p-6 sm:p-8"
        aria-labelledby="combinations-heading"
      >
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Prep mode
        </p>
        <h2 className="mt-2 text-3xl font-semibold" id="combinations-heading">
          Top combinations
        </h2>
        {result ? (
          <ol className="mt-6 divide-y divide-[var(--color-hairline)]">
            {result.topCombinations.map((combination, index) => (
              <li
                className="grid gap-2 py-5 sm:grid-cols-[2rem_1fr_auto] sm:items-center"
                key={combination.playerIds.join("-")}
              >
                <span className="text-sm text-[var(--color-stone)]">
                  {index + 1}
                </span>
                <span className="font-medium">
                  {combination.playerIds
                    .map((playerId) => playerNames.get(playerId) ?? playerId)
                    .join(" + ")}
                </span>
                <span className="text-sm tabular-nums text-[var(--color-mute)]">
                  {combination.score.toFixed(2)} ·{" "}
                  {Math.round(combination.frequency * 100)}%
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-6 rounded-3xl bg-[var(--color-soft-cloud)] p-8 text-center">
            <p className="font-medium">Ready to explore draft paths</p>
            <p className="mt-2 text-sm text-[var(--color-mute)]">
              Run a simulation to compare your strongest player combinations.
            </p>
          </div>
        )}
      </section>

      <RecPanel players={state.players} result={result} />
    </div>
  )
}
