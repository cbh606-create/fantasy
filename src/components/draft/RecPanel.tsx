import type {
  CategoryId,
  Player,
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

type RecPanelProps = {
  players: Player[]
  result: SimulationResult | null
}

export const RecPanel = ({ players, result }: RecPanelProps) => {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))

  return (
    <aside className="space-y-8 rounded-[2rem] bg-[var(--color-soft-cloud)] p-6">
      <section aria-labelledby="next-picks-heading">
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Recommendations
        </p>
        <h2 className="mt-2 text-2xl font-semibold" id="next-picks-heading">
          Next picks
        </h2>
        {result ? (
          <ol className="mt-5 space-y-3">
            {result.nextPicks.map((pick, index) => (
              <li
                className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3"
                key={pick.playerId}
              >
                <div>
                  <span className="mr-3 text-sm text-[var(--color-stone)]">
                    {index + 1}
                  </span>
                  <span className="font-medium">
                    {playerNames.get(pick.playerId) ?? pick.playerId}
                  </span>
                </div>
                <span className="text-sm tabular-nums text-[var(--color-mute)]">
                  {Math.round(pick.frequency * 100)}%
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--color-mute)]">
            Run a simulation to rank your best available picks.
          </p>
        )}
      </section>

      <section
        className="border-t border-[var(--color-hairline)] pt-7"
        aria-labelledby="category-outlook-heading"
      >
        <h2 className="text-2xl font-semibold" id="category-outlook-heading">
          Category outlook
        </h2>
        {result ? (
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {Object.entries(result.categoryOutlook).map(([categoryId, score]) => (
              <div className="rounded-2xl bg-white p-3" key={categoryId}>
                <dt className="text-xs text-[var(--color-mute)]">
                  {CATEGORY_LABELS[categoryId as CategoryId]}
                </dt>
                <dd className="mt-1 font-medium tabular-nums">
                  {score > 0 ? "+" : ""}
                  {score.toFixed(2)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--color-mute)]">
            Projected category strength will appear here.
          </p>
        )}
      </section>
    </aside>
  )
}
