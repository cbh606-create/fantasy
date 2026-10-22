import type { CategoryId } from "@/lib/domain/types"
import { pairPenalty, type StatPairRow } from "@/lib/players/statPairCorrelation"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type { SeasonLeagueState } from "@/lib/season/types"
import { MATCHUP_CATEGORY_SIGMOID_SCALE } from "./constants"
import { isContestedCategoryRow } from "./streamingDropExplain"
import type { MatchupBoard, MatchupCategoryRow, StreamingChaseNote } from "./types"

export type { StreamingChaseNote } from "./types"

const SEASON_LEAK_WIN_RATE = 1 / 3

export const mergeStreamingPuntIds = (
  categories: readonly { id: CategoryId; weight: number }[],
  toggled: readonly CategoryId[] = [],
): Set<CategoryId> => {
  const ids = new Set(
    categories.filter((category) => category.weight === 0).map((category) => category.id),
  )
  for (const categoryId of toggled) ids.add(categoryId)
  return ids
}

export const findStatPair = (
  pairs: readonly StatPairRow[],
  left: CategoryId,
  right: CategoryId,
): StatPairRow | undefined =>
  pairs.find(
    (row) =>
      (row.categoryA === left && row.categoryB === right) ||
      (row.categoryA === right && row.categoryB === left),
  )

export const streamingChaseNote = (
  chaseIds: readonly CategoryId[],
  pairs: readonly StatPairRow[] = [],
): StreamingChaseNote => {
  if (chaseIds.length !== 2) {
    return { categoryIds: [...chaseIds], r: null, penalty: 0 }
  }
  const pair = findStatPair(pairs, chaseIds[0]!, chaseIds[1]!)
  if (!pair) {
    return { categoryIds: [chaseIds[0]!, chaseIds[1]!], r: null, penalty: 0 }
  }
  return {
    categoryIds: [pair.categoryA, pair.categoryB],
    r: pair.measured ? pair.r : null,
    penalty: pairPenalty(pair.r, pair.measured),
  }
}

const winRateForRank = (rank: number, teamCount: number): number => {
  if (teamCount < 2) return 1
  return (teamCount - rank) / (teamCount - 1)
}

export const seasonLeakCategoryIds = (
  state: SeasonLeagueState,
  puntCategoryIds: ReadonlySet<CategoryId>,
): Set<CategoryId> => {
  const teamCount = state.teams.length
  if (teamCount < 2) return new Set()
  const analysis = analyzeSeasonLeague(state)
  const leaks = new Set<CategoryId>()
  for (const category of analysis.byCategory) {
    if (puntCategoryIds.has(category.categoryId)) continue
    const row = category.rows.find(
      (entry) => entry.teamIndex === state.perspectiveTeamIndex,
    )
    if (!row) continue
    if (winRateForRank(row.rank, teamCount) <= SEASON_LEAK_WIN_RATE) {
      leaks.add(category.categoryId)
    }
  }
  return leaks
}

const chaseRows = (
  board: MatchupBoard,
  chaseIds: readonly CategoryId[],
): MatchupCategoryRow[] =>
  chaseIds.flatMap((categoryId) => {
    const row = board.categories.find((entry) => entry.categoryId === categoryId)
    return row ? [row] : []
  })

/** Contestable undeclared leak, otherwise the chase with the larger gap. */
export const priorityChaseCategoryId = (
  board: MatchupBoard,
  chaseIds: readonly CategoryId[],
  leakIds: ReadonlySet<CategoryId> = new Set(),
): CategoryId | null => {
  const rows = chaseRows(board, chaseIds)
  if (rows.length === 0) return chaseIds[0] ?? null
  const contestableLeaks = rows.filter(
    (row) => leakIds.has(row.categoryId) && isContestedCategoryRow(row),
  )
  const pool = contestableLeaks.length > 0 ? contestableLeaks : rows
  return [...pool].sort((left, right) => left.winProb - right.winProb)[0]?.categoryId ?? null
}

export const adjustedChaseWinProb = (
  contestedDelta: number,
  raisesBoth: boolean,
  penalty: number,
): number => contestedDelta - (raisesBoth && penalty > 0 ? penalty : 0)

const clampWinProb = (winProb: number): number =>
  Math.min(1 - 1e-6, Math.max(1e-6, winProb))

export const shiftCategoryWinProb = (
  winProb: number,
  marginShift: number,
  categoryId: CategoryId,
): number => {
  if (marginShift === 0) return winProb
  const scale = MATCHUP_CATEGORY_SIGMOID_SCALE[categoryId]
  const margin =
    scale * Math.log(clampWinProb(winProb) / (1 - clampWinProb(winProb)))
  return 1 / (1 + Math.exp(-(margin + marginShift) / scale))
}

const outcomeForWinProb = (
  winProb: number,
  previous: MatchupCategoryRow["outcome"],
  shifted: boolean,
): MatchupCategoryRow["outcome"] => {
  if (!shifted) return previous
  if (winProb > 0.5) return "W"
  if (winProb < 0.5) return "L"
  return "T"
}

/** Move the frozen matchup by the opponent's streaming delta. A zero delta keeps win probs. */
export const shiftMatchupBoardByOpponentDelta = (
  board: MatchupBoard,
  baseOppTotals: Record<CategoryId, number>,
  streamedOppTotals: Record<CategoryId, number>,
): MatchupBoard => {
  let wins = 0
  let losses = 0
  let ties = 0
  let projectedCatWins = 0
  const categories = board.categories.map((row) => {
    const delta =
      (streamedOppTotals[row.categoryId] ?? 0) -
      (baseOppTotals[row.categoryId] ?? 0)
    const marginShift = row.categoryId === "TO" ? delta : -delta
    const shifted = marginShift !== 0
    const winProb = shiftCategoryWinProb(
      row.winProb,
      marginShift,
      row.categoryId,
    )
    const outcome = outcomeForWinProb(winProb, row.outcome, shifted)
    if (outcome === "W") wins += 1
    else if (outcome === "L") losses += 1
    else ties += 1
    projectedCatWins += winProb
    return {
      ...row,
      opp: row.opp + delta,
      winProb,
      outcome,
    }
  })
  return { categories, wins, losses, ties, projectedCatWins }
}
