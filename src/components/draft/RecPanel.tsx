import { PlayerAvatar } from "@/components/draft/PlayerAvatar"
import type {
  CategoryId,
  Player,
  SimulationResult,
} from "@/lib/domain/types"
import { formatNextPickFrequency } from "@/lib/sim/formatNextPickFrequency"

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
  emptyMessage?: string
  isSimulating?: boolean
  layout?: "stack" | "row"
  maxNextPicks?: number
  players: Player[]
  result: SimulationResult | null
  showCategoryOutlook?: boolean
}

export const RecPanel = ({
  emptyMessage = "Run a simulation to rank your best available picks.",
  isSimulating = false,
  layout = "stack",
  maxNextPicks,
  players,
  result,
  showCategoryOutlook = true,
}: RecPanelProps) => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const nextPicks = result
    ? maxNextPicks === undefined
      ? result.nextPicks
      : result.nextPicks.slice(0, maxNextPicks)
    : []
  const isRow = layout === "row"

  return (
    <aside
      className={
        isRow
          ? "rounded-2xl bg-[var(--color-soft-cloud)] px-4 py-3 sm:px-5"
          : "space-y-8 rounded-[2rem] bg-[var(--color-soft-cloud)] p-6"
      }
    >
      <section aria-labelledby="next-picks-heading">
        <div
          className={
            isRow
              ? "flex flex-wrap items-baseline justify-between gap-2"
              : undefined
          }
        >
          <div>
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              Recommendations
            </p>
            <h2
              className={
                isRow
                  ? "mt-1 text-lg font-semibold sm:text-xl"
                  : "mt-2 text-2xl font-semibold"
              }
              id="next-picks-heading"
            >
              Next picks
            </h2>
            {result ? (
              <p className="text-xs text-[var(--color-mute)]">
                Based on {result.meta.simCount} sims
              </p>
            ) : null}
          </div>
          {isRow && isSimulating && result ? (
            <p className="text-xs text-[var(--color-mute)]" role="status">
              Updating…
            </p>
          ) : null}
        </div>
        {result ? (
          <ol
            className={
              isRow
                ? "mt-3 grid gap-2 sm:grid-cols-3"
                : "mt-5 space-y-3"
            }
          >
            {nextPicks.map((pick, index) => {
              const player = playersById.get(pick.playerId)
              const displayName = player?.name ?? pick.playerId

              return (
                <li
                  className={
                    isRow
                      ? "flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"
                      : "flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3"
                  }
                  key={pick.playerId}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-sm text-[var(--color-stone)]">
                      {index + 1}
                    </span>
                    {player ? <PlayerAvatar player={player} size="sm" /> : null}
                    <span className="min-w-0 font-medium">
                      {displayName}
                      {player ? (
                        <span className="ml-1.5 font-normal text-[var(--color-mute)]">
                          {player.teamAbbr ?? "—"}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-[var(--color-mute)]">
                    {formatNextPickFrequency(pick.frequency)}
                  </span>
                </li>
              )
            })}
          </ol>
        ) : (
          <p
            className={
              isRow
                ? "mt-2 text-sm leading-6 text-[var(--color-mute)]"
                : "mt-4 text-sm leading-6 text-[var(--color-mute)]"
            }
            role="status"
          >
            {isSimulating ? "Simulating…" : emptyMessage}
          </p>
        )}
      </section>

      {showCategoryOutlook ? (
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
      ) : null}
    </aside>
  )
}
