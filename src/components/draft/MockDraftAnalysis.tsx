import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, DraftBoard, Player } from "@/lib/domain/types"
import { buildMockCategoryRankReport } from "@/lib/draft/mockCategoryRanks"

type MockDraftAnalysisProps = {
  isAdvancing?: boolean
  mockBoard: DraftBoard
  perspectiveTeamIndex: number
  players: Player[]
  teams: number
}

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

const formatValue = (categoryId: CategoryId, value: number) => {
  if (categoryId === "FG_PCT" || categoryId === "FT_PCT") {
    return value.toFixed(3)
  }
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1)
}

export const MockDraftAnalysis = ({
  isAdvancing = false,
  mockBoard,
  perspectiveTeamIndex,
  players,
  teams,
}: MockDraftAnalysisProps) => {
  const pickedCount = mockBoard.picks.filter((pick) => pick.playerId).length
  // Skip heavy rank matrix while CPU is ticking picks.
  if (pickedCount === 0 || isAdvancing) return null

  const report = buildMockCategoryRankReport(mockBoard, players, teams)
  const you = report.teams[perspectiveTeamIndex]
  if (!you) return null

  const isBottomTier = (rank: number) =>
    teams <= 3 ? rank === teams : rank > teams - 3

  const topThreeCount = ALL_CATEGORY_IDS.filter(
    (categoryId) => you.ranks[categoryId] <= Math.min(3, teams),
  ).length
  const bottomThreeCount = ALL_CATEGORY_IDS.filter((categoryId) =>
    isBottomTier(you.ranks[categoryId]),
  ).length

  return (
    <section
      aria-labelledby="mock-analysis-heading"
      className="mt-4 rounded-[2rem] border border-[var(--color-hairline)] p-4 sm:p-5"
    >
      <p className="text-[0.65rem] tracking-[0.16em] text-[var(--color-mute)] uppercase">
        Result analysis
      </p>
      <h2 className="mt-1 text-xl font-semibold" id="mock-analysis-heading">
        Category ranks
      </h2>
      <p className="mt-1 text-xs text-[var(--color-mute)] sm:text-sm">
        Your team vs all {teams} teams from drafted projections.
        Overall: {you.overallRank}/{teams} (rank sum {you.rankSum}) · Top-3
        cats: {topThreeCount} · Bottom-3 cats: {bottomThreeCount}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-[0.65rem] tracking-wide text-[var(--color-mute)] uppercase">
              <th className="py-1.5 pr-2 font-medium">Cat</th>
              <th className="px-2 py-1.5 font-medium">Your value</th>
              <th className="px-2 py-1.5 font-medium">Your rank</th>
              <th className="py-1.5 pl-2 font-medium">Best team</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const overallHighlight =
                you.overallRank === 1
                  ? "text-emerald-800"
                  : you.overallRank <= Math.min(3, teams)
                    ? "text-[var(--color-ink)]"
                    : isBottomTier(you.overallRank)
                      ? "text-rose-800"
                      : ""
              const bestOverall = report.teams.find(
                (team) => team.overallRank === 1,
              )

              return (
                <tr className="border-t border-[var(--color-hairline)] bg-[var(--color-soft-cloud)]/60">
                  <th className="py-2 pr-2 font-semibold" scope="row">
                    Overall
                  </th>
                  <td className="px-2 py-2 tabular-nums text-[var(--color-mute)]">
                    sum {you.rankSum}
                  </td>
                  <td
                    className={`px-2 py-2 tabular-nums font-semibold ${overallHighlight}`}
                  >
                    {you.overallRank}
                    <span className="font-normal text-[var(--color-mute)]">
                      /{teams}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-[var(--color-mute)]">
                    {bestOverall
                      ? `T${bestOverall.teamIndex + 1}${
                          bestOverall.teamIndex === perspectiveTeamIndex
                            ? " (You)"
                            : ""
                        } · sum ${bestOverall.rankSum}`
                      : "—"}
                  </td>
                </tr>
              )
            })()}
            {ALL_CATEGORY_IDS.map((categoryId) => {
              const rank = you.ranks[categoryId]
              const bestTeam = report.teams.find(
                (team) => team.ranks[categoryId] === 1,
              )
              const highlight =
                rank === 1
                  ? "text-emerald-800"
                  : rank <= Math.min(3, teams)
                    ? "text-[var(--color-ink)]"
                    : isBottomTier(rank)
                      ? "text-rose-800"
                      : ""

              return (
                <tr
                  className="border-t border-[var(--color-hairline)]/70"
                  key={categoryId}
                >
                  <th className="py-2 pr-2 font-medium" scope="row">
                    {CATEGORY_LABELS[categoryId]}
                  </th>
                  <td className="px-2 py-2 tabular-nums">
                    {formatValue(categoryId, you.totals[categoryId])}
                  </td>
                  <td className={`px-2 py-2 tabular-nums font-semibold ${highlight}`}>
                    {rank}
                    <span className="font-normal text-[var(--color-mute)]">
                      /{teams}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-[var(--color-mute)]">
                    {bestTeam
                      ? `T${bestTeam.teamIndex + 1}${
                          bestTeam.teamIndex === perspectiveTeamIndex
                            ? " (You)"
                            : ""
                        } · ${formatValue(
                          categoryId,
                          bestTeam.totals[categoryId],
                        )}`
                      : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 overflow-x-auto">
        <p className="mb-2 text-[0.65rem] tracking-wide text-[var(--color-mute)] uppercase">
          Full league matrix
        </p>
        <table className="w-max min-w-full border-collapse text-left text-[0.65rem] sm:text-xs">
          <thead>
            <tr className="text-[var(--color-mute)]">
              <th className="sticky left-0 z-10 bg-[var(--color-canvas)] py-1.5 pr-2 font-medium">
                Team
              </th>
              <th className="px-1.5 py-1.5 font-medium">OVR</th>
              {ALL_CATEGORY_IDS.map((categoryId) => (
                <th className="px-1.5 py-1.5 font-medium" key={categoryId}>
                  {CATEGORY_LABELS[categoryId]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.teams.map((team) => {
              const isYou = team.teamIndex === perspectiveTeamIndex
              return (
                <tr
                  className={`border-t border-[var(--color-hairline)]/70 ${
                    isYou ? "bg-[var(--color-soft-cloud)]" : ""
                  }`}
                  key={team.teamIndex}
                >
                  <th
                    className={`sticky left-0 z-10 py-1.5 pr-2 font-medium ${
                      isYou
                        ? "bg-[var(--color-soft-cloud)]"
                        : "bg-[var(--color-canvas)]"
                    }`}
                    scope="row"
                  >
                    T{team.teamIndex + 1}
                    {isYou ? " · You" : ""}
                  </th>
                  <td
                    className="px-1.5 py-1.5 tabular-nums font-semibold"
                    title={
                      team.rosterSize === 0
                        ? undefined
                        : `Rank sum ${team.rankSum}`
                    }
                  >
                    {team.rosterSize === 0 ? "—" : team.overallRank}
                  </td>
                  {ALL_CATEGORY_IDS.map((categoryId) => (
                    <td
                      className="px-1.5 py-1.5 tabular-nums text-[var(--color-mute)]"
                      key={categoryId}
                      title={formatValue(
                        categoryId,
                        team.totals[categoryId],
                      )}
                    >
                      {team.rosterSize === 0 ? "—" : team.ranks[categoryId]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
