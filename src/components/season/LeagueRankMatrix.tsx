"use client"

import { useState } from "react"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonAnalysis } from "@/lib/season/analysis"
import { sortTeamsByCategoryRank, type SortDirection } from "@/lib/season/matrixSort"
import type { SeasonTeamRoster } from "@/lib/season/types"

type LeagueRankMatrixProps = {
  analysis: SeasonAnalysis
  perspectiveTeamIndex: number
  teams: SeasonTeamRoster[]
}

const categoryLabels: Record<CategoryId, string> = {
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

export const LeagueRankMatrix = ({
  analysis,
  perspectiveTeamIndex,
  teams,
}: LeagueRankMatrixProps) => {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const ranksByCategory = new Map(
    analysis.byCategory.map((category) => [
      category.categoryId,
      Object.fromEntries(category.rows.map((row) => [row.teamIndex, row.rank])),
    ]),
  )
  const teamIndexes = teams.map((team) => team.teamIndex)
  const sortedTeamIndexes = activeCategory
    ? sortTeamsByCategoryRank({
        teamIndexes,
        ranksByTeam: ranksByCategory.get(activeCategory) ?? {},
        direction: sortDirection,
      })
    : teamIndexes
  const teamsByIndex = new Map(teams.map((team) => [team.teamIndex, team]))

  const handleCategorySort = (categoryId: CategoryId) => {
    if (activeCategory === categoryId) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc")
      return
    }

    setActiveCategory(categoryId)
    setSortDirection("asc")
  }

  const handleReset = () => {
    setActiveCategory(null)
    setSortDirection("asc")
  }

  return (
    <section aria-labelledby="rank-matrix-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
            9-category ranks
          </p>
          <h2 className="mt-1 text-3xl font-semibold" id="rank-matrix-heading">
            League rank matrix
          </h2>
        </div>
        <button
          className="rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
          onClick={handleReset}
          type="button"
        >
          Reset matrix order
        </button>
      </div>
      <div className="overflow-x-auto rounded-[2rem] border border-[var(--color-hairline)]">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead className="bg-[var(--color-soft-cloud)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase" scope="col">
                Team
              </th>
              {ALL_CATEGORY_IDS.map((categoryId) => {
                const isActive = activeCategory === categoryId
                const directionLabel = isActive
                  ? sortDirection === "asc" ? "best first" : "worst first"
                  : "best first"

                return (
                  <th className="px-1 py-2 text-center" key={categoryId} scope="col">
                    <button
                      aria-label={`Sort by ${categoryLabels[categoryId]}, ${directionLabel}`}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        isActive ? "bg-[var(--color-ink)] text-white" : "hover:bg-white"
                      }`}
                      onClick={() => handleCategorySort(categoryId)}
                      type="button"
                    >
                      {categoryLabels[categoryId]}{isActive ? sortDirection === "asc" ? " ↑" : " ↓" : ""}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedTeamIndexes.map((teamIndex) => {
              const isYou = teamIndex === perspectiveTeamIndex
              const team = teamsByIndex.get(teamIndex)

              return (
                <tr className={isYou ? "bg-[var(--color-ink)] text-white" : "border-t border-[var(--color-hairline)]"} key={teamIndex}>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium" scope="row">
                    {isYou ? "YOU" : team?.name ?? `Team ${teamIndex + 1}`}
                  </th>
                  {ALL_CATEGORY_IDS.map((categoryId) => {
                    const rank = ranksByCategory.get(categoryId)?.[teamIndex]
                    const heat = rank
                      ? Math.round(
                          ((teams.length - rank) / Math.max(teams.length - 1, 1)) *
                            100,
                        )
                      : 0
                    // Soften the green/red mix so ranks stay tinted but not loud.
                    const heatColor = `color-mix(in srgb, var(--color-success) ${heat}%, var(--color-sale))`
                    const softHeatColor = `color-mix(in srgb, ${heatColor} 28%, white)`

                    return (
                      <td
                        className={isYou ? "px-1 py-2 text-center tabular-nums" : "px-1 py-2 text-center tabular-nums"}
                        key={categoryId}
                      >
                        <span
                          className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 ${
                            isYou ? "bg-white/15" : ""
                          }`}
                          style={
                            isYou
                              ? undefined
                              : { backgroundColor: softHeatColor }
                          }
                        >
                          #{rank ?? "—"}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
