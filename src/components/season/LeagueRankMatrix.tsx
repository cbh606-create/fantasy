"use client"

import { useRef, useState } from "react"
import { CategoryZDialog } from "@/components/season/CategoryZDialog"
import {
  CategoryZScale,
  formatSignedZ,
  type CategoryZDot,
} from "@/components/season/CategoryZScale"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { FormWindow, SeasonAnalysis } from "@/lib/season/analysis"
import { CATEGORY_SHORT_LABELS } from "@/lib/season/formatCategoryStat"
import { sortTeamsByCategoryRank, type SortDirection } from "@/lib/season/matrixSort"
import type { SeasonTeamRoster } from "@/lib/season/types"

type RankBasis = "total" | "perGame"
type ScoreMode = "rank" | "z"

type FormAnalysis = {
  total: SeasonAnalysis
  perGame?: SeasonAnalysis | null
}

type LeagueRankMatrixProps = {
  analysis: SeasonAnalysis
  perGameAnalysis?: SeasonAnalysis | null
  formAnalyses?: Partial<Record<Exclude<FormWindow, "season">, FormAnalysis>>
  perspectiveTeamIndex: number
  teams: SeasonTeamRoster[]
}

type SortKey = CategoryId | "overall" | "rankSum"

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

const sortKeyLabel = (key: SortKey, scoreMode: ScoreMode) => {
  if (key === "overall") return "Overall"
  if (key === "rankSum") return scoreMode === "z" ? "Z sum" : "Rank sum"
  return categoryLabels[key]
}

const isSummaryKey = (key: SortKey) => key === "overall" || key === "rankSum"

const FORM_WINDOWS = [
  ["season", "Season"],
  ["l7", "7"],
  ["l15", "15"],
  ["l30", "30"],
] as const

export const LeagueRankMatrix = ({
  analysis,
  perGameAnalysis,
  formAnalyses,
  perspectiveTeamIndex,
  teams,
}: LeagueRankMatrixProps) => {
  const [formWindow, setFormWindow] = useState<FormWindow>("season")
  const [basis, setBasis] = useState<RankBasis>("total")
  const [scoreMode, setScoreMode] = useState<ScoreMode>("rank")
  const [activeSortKey, setActiveSortKey] = useState<SortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [openCategoryId, setOpenCategoryId] = useState<CategoryId | null>(null)
  const windowAnalysis = formWindow === "season"
    ? { total: analysis, perGame: perGameAnalysis }
    : formAnalyses?.[formWindow] ?? { total: analysis, perGame: perGameAnalysis }
  const shownAnalysis =
    basis === "perGame" && windowAnalysis.perGame
      ? windowAnalysis.perGame
      : windowAnalysis.total
  const triggerRefs = useRef<Partial<Record<CategoryId, HTMLButtonElement | null>>>({})
  const ranksByCategory = new Map(
    shownAnalysis.byCategory.map((category) => [
      category.categoryId,
      Object.fromEntries(category.rows.map((row) => [row.teamIndex, row.rank])),
    ]),
  )
  const overallByTeam = Object.fromEntries(
    shownAnalysis.overall.rows.map((row) => [row.teamIndex, row.rank]),
  )
  const rankSumByTeam = Object.fromEntries(
    shownAnalysis.overall.rows.map((row) => [row.teamIndex, row.rankSum]),
  )
  const zByCategory = new Map(
    shownAnalysis.byCategory.map((category) => [
      category.categoryId,
      Object.fromEntries(category.rows.map((row) => [row.teamIndex, row.z])),
    ]),
  )
  const teamIndexes = teams.map((team) => team.teamIndex)
  const zSumByTeam = Object.fromEntries(
    teamIndexes.map((teamIndex) => [
      teamIndex,
      ALL_CATEGORY_IDS.reduce(
        (sum, categoryId) => sum + (zByCategory.get(categoryId)?.[teamIndex] ?? 0),
        0,
      ),
    ]),
  )
  const zOverallByTeam = Object.fromEntries(
    sortTeamsByCategoryRank({
      teamIndexes,
      ranksByTeam: Object.fromEntries(
        teamIndexes.map((teamIndex) => [teamIndex, -(zSumByTeam[teamIndex] ?? 0)]),
      ),
      direction: "asc",
    }).map((teamIndex, index) => [teamIndex, index + 1]),
  )
  const placeByTeam = scoreMode === "z" ? zOverallByTeam : overallByTeam
  const sortedTeamIndexes = activeSortKey
    ? sortTeamsByCategoryRank({
        teamIndexes,
        ranksByTeam:
          activeSortKey === "overall"
            ? placeByTeam
            : activeSortKey === "rankSum"
              ? scoreMode === "z"
                ? Object.fromEntries(
                    teamIndexes.map((teamIndex) => [teamIndex, -(zSumByTeam[teamIndex] ?? 0)]),
                  )
                : rankSumByTeam
              : scoreMode === "z"
                ? Object.fromEntries(
                    teamIndexes.map((teamIndex) => [
                      teamIndex,
                      -(zByCategory.get(activeSortKey)?.[teamIndex] ?? 0),
                    ]),
                  )
                : ranksByCategory.get(activeSortKey) ?? {},
        direction: sortDirection,
      })
    : teamIndexes
  const teamsByIndex = new Map(teams.map((team) => [team.teamIndex, team]))

  const dotsFor = (categoryId: CategoryId): CategoryZDot[] | null => {
    const category = shownAnalysis.byCategory.find(
      (entry) => entry.categoryId === categoryId,
    )
    if (!category || category.rows.length === 0) return null

    return category.rows.map((row) => {
      const isYou = row.teamIndex === perspectiveTeamIndex
      const team = teamsByIndex.get(row.teamIndex)

      return {
        teamIndex: row.teamIndex,
        name: isYou ? "YOU" : team?.name ?? `Team ${row.teamIndex + 1}`,
        raw: row.raw,
        z: row.z,
        isYou,
      }
    })
  }

  const handleCloseScale = () => {
    const categoryId = openCategoryId
    setOpenCategoryId(null)
    if (categoryId) triggerRefs.current[categoryId]?.focus()
  }

  const handleSort = (key: SortKey) => {
    if (activeSortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
      return
    }

    setActiveSortKey(key)
    setSortDirection("asc")
  }

  const handleReset = () => {
    setActiveSortKey(null)
    setSortDirection("asc")
  }

  const renderRankCell = (
    rank: number | undefined,
    isYou: boolean,
    opts?: { label?: string; title?: string; tone?: "category" | "overall" },
  ) => {
    const tone = opts?.tone ?? "category"
    const heat = rank
      ? Math.round(
          ((teams.length - rank) / Math.max(teams.length - 1, 1)) * 100,
        )
      : 0
    const heatColor =
      tone === "overall"
        ? `color-mix(in srgb, var(--color-ink) ${heat}%, var(--color-mute))`
        : `color-mix(in srgb, var(--color-success) ${heat}%, var(--color-sale))`
    const softHeatColor =
      tone === "overall"
        ? `color-mix(in srgb, ${heatColor} 22%, #e8eef8)`
        : `color-mix(in srgb, ${heatColor} 28%, white)`

    return (
      <span
        className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 ${
          isYou
            ? tone === "overall"
              ? "bg-sky-300/25 text-sky-100"
              : "bg-white/15"
            : tone === "overall"
              ? "font-semibold text-[var(--color-ink)]"
              : ""
        }`}
        style={isYou ? undefined : { backgroundColor: softHeatColor }}
        title={opts?.title}
      >
        {opts?.label ?? `#${rank ?? "—"}`}
      </span>
    )
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
        <div className="flex flex-wrap items-center gap-3">
          <div
            aria-label="Rank window"
            className="flex rounded-full bg-[var(--color-soft-cloud)] p-1"
            role="radiogroup"
          >
            {FORM_WINDOWS.map(([value, label]) => {
              const selected = formWindow === value

              return (
                <button
                  aria-checked={selected}
                  className={`rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    selected
                      ? "bg-[var(--color-ink)] text-white"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                  }`}
                  key={value}
                  onClick={() => setFormWindow(value)}
                  role="radio"
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div
            aria-label="Rank basis"
            className="flex rounded-full bg-[var(--color-soft-cloud)] p-1"
            role="radiogroup"
          >
            {([
              ["total", "Total"],
              ["perGame", "Per game"],
            ] as const).map(([value, label]) => {
              const selected = basis === value

              return (
                <button
                  aria-checked={selected}
                  className={`rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    selected
                      ? "bg-[var(--color-ink)] text-white"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                  }`}
                  key={value}
                  onClick={() => setBasis(value)}
                  role="radio"
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div
            aria-label="Score"
            className="flex rounded-full bg-[var(--color-soft-cloud)] p-1"
            role="radiogroup"
          >
            {([
              ["rank", "Rank"],
              ["z", "Z"],
            ] as const).map(([value, label]) => {
              const selected = scoreMode === value

              return (
                <button
                  aria-checked={selected}
                  className={`rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
                    selected
                      ? "bg-[var(--color-ink)] text-white"
                      : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                  }`}
                  key={value}
                  onClick={() => setScoreMode(value)}
                  role="radio"
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </div>
          <button
            className="rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            onClick={handleReset}
            type="button"
          >
            Reset matrix order
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[2rem] border border-[var(--color-hairline)]">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead className="bg-[var(--color-soft-cloud)]">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase"
                scope="col"
              >
                Team
              </th>
              {(["overall", "rankSum", ...ALL_CATEGORY_IDS] as SortKey[]).map((key) => {
                const isActive = activeSortKey === key
                const summary = isSummaryKey(key)
                const directionLabel = isActive
                  ? sortDirection === "asc"
                    ? "best first"
                    : "worst first"
                  : "best first"

                return (
                  <th
                    className={`px-1 py-2 text-center ${
                      key === "rankSum"
                        ? "border-r border-[var(--color-hairline)]"
                        : ""
                    }`}
                    key={key}
                    scope="col"
                  >
                    <button
                      aria-label={`Sort by ${sortKeyLabel(key, scoreMode)}, ${directionLabel}`}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        isActive
                          ? summary
                            ? "bg-sky-800 text-white"
                            : "bg-[var(--color-ink)] text-white"
                          : summary
                            ? "text-sky-900 hover:bg-sky-50"
                            : "hover:bg-white"
                      }`}
                      onClick={() => handleSort(key)}
                      type="button"
                    >
                      {sortKeyLabel(key, scoreMode)}
                      {isActive
                        ? sortDirection === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
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
              const overallRank = placeByTeam[teamIndex]
              const rankSum = rankSumByTeam[teamIndex]
              const zSum = zSumByTeam[teamIndex]

              return (
                <tr
                  className={
                    isYou
                      ? "bg-[var(--color-ink)] text-white"
                      : "border-t border-[var(--color-hairline)]"
                  }
                  key={teamIndex}
                >
                  <th
                    className="whitespace-nowrap px-4 py-3 text-left font-medium"
                    scope="row"
                  >
                    {isYou ? "YOU" : team?.name ?? `Team ${teamIndex + 1}`}
                  </th>
                  <td className="px-1 py-2 text-center tabular-nums font-semibold">
                    {renderRankCell(overallRank, isYou, { tone: "overall" })}
                  </td>
                  <td
                    className="border-r border-[var(--color-hairline)] px-1 py-2 text-center tabular-nums font-semibold"
                    title={
                      scoreMode === "z"
                        ? `Z sum ${formatSignedZ(zSum ?? 0)} (higher is better)`
                        : rankSum != null
                          ? `Rank sum ${rankSum} (lower is better)`
                          : undefined
                    }
                  >
                    {scoreMode === "z" ? formatSignedZ(zSum ?? 0) : rankSum ?? "—"}
                  </td>
                  {ALL_CATEGORY_IDS.map((categoryId) => {
                    const rank = ranksByCategory.get(categoryId)?.[teamIndex]
                    const z = zByCategory.get(categoryId)?.[teamIndex]

                    return (
                      <td
                        className="px-1 py-2 text-center tabular-nums"
                        key={categoryId}
                      >
                        {scoreMode === "z"
                          ? renderRankCell(rank, isYou, {
                              label: z == null ? "—" : formatSignedZ(z),
                            })
                          : renderRankCell(rank, isYou)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-hairline)] bg-[var(--color-soft-cloud)]">
              <th
                className="px-4 py-3 text-left text-xs tracking-[0.08em] text-[var(--color-mute)] uppercase"
                scope="row"
              >
                Z
              </th>
              <td className="px-1 py-2 text-center text-[var(--color-mute)]">
                —
              </td>
              <td className="border-r border-[var(--color-hairline)] px-1 py-2 text-center text-[var(--color-mute)]">
                —
              </td>
              {ALL_CATEGORY_IDS.map((categoryId) => {
                const dots = dotsFor(categoryId)
                if (!dots) {
                  return (
                    <td
                      className="px-1 py-2 text-center text-[var(--color-mute)]"
                      key={categoryId}
                    >
                      —
                    </td>
                  )
                }

                return (
                  <td className="px-1 py-2 text-center" key={categoryId}>
                    <button
                      aria-label={`Show ${CATEGORY_SHORT_LABELS[categoryId]} league z`}
                      className="rounded-lg px-1 py-1 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
                      onClick={() => setOpenCategoryId(categoryId)}
                      ref={(node) => {
                        triggerRefs.current[categoryId] = node
                      }}
                      type="button"
                    >
                      <CategoryZScale
                        categoryId={categoryId}
                        dots={dots}
                        mode="compact"
                      />
                    </button>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      {openCategoryId
        ? (() => {
            const dots = dotsFor(openCategoryId)
            if (!dots) return null

            return (
              <CategoryZDialog
                categoryId={openCategoryId}
                dots={dots}
                label={CATEGORY_SHORT_LABELS[openCategoryId]}
                onClose={handleCloseScale}
              />
            )
          })()
        : null}
    </section>
  )
}
