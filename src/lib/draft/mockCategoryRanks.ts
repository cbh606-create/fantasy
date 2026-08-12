import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId, DraftBoard, Player } from "@/lib/domain/types"
import { rosterTotals } from "@/lib/sim/score"

export type MockTeamCategoryRow = {
  teamIndex: number
  totals: Record<CategoryId, number>
  ranks: Record<CategoryId, number>
  rosterSize: number
}

export type MockCategoryRankReport = {
  teams: MockTeamCategoryRow[]
  categoryIds: CategoryId[]
}

const emptyTotals = (): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as Record<CategoryId, number>

const isLowerBetter = (categoryId: CategoryId) => categoryId === "TO"

/** Build per-team projection totals and 1-based category ranks from a mock board. */
export const buildMockCategoryRankReport = (
  board: DraftBoard,
  players: Player[],
  teams: number,
): MockCategoryRankReport => {
  const byId = new Map(players.map((player) => [player.id, player]))
  const rosters: Player[][] = Array.from({ length: teams }, () => [])

  for (const pick of board.picks) {
    if (!pick.playerId) continue
    if (pick.teamIndex < 0 || pick.teamIndex >= teams) continue
    const player = byId.get(pick.playerId)
    if (!player) continue
    rosters[pick.teamIndex].push(player)
  }

  const teamTotals = rosters.map((roster) =>
    roster.length ? rosterTotals(roster) : emptyTotals(),
  )

  const ranksByCategory = Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => {
      const ordered = teamTotals
        .map((totals, teamIndex) => ({
          teamIndex,
          value: totals[categoryId],
          rosterSize: rosters[teamIndex].length,
        }))
        // Empty rosters sort last.
        .sort((left, right) => {
          if (left.rosterSize === 0 && right.rosterSize === 0) {
            return left.teamIndex - right.teamIndex
          }
          if (left.rosterSize === 0) return 1
          if (right.rosterSize === 0) return -1

          if (left.value === right.value) {
            return left.teamIndex - right.teamIndex
          }

          return isLowerBetter(categoryId)
            ? left.value - right.value
            : right.value - left.value
        })

      const ranks = Array.from({ length: teams }, () => teams)
      ordered.forEach((entry, index) => {
        ranks[entry.teamIndex] = index + 1
      })
      return [categoryId, ranks]
    }),
  ) as Record<CategoryId, number[]>

  const teamRows: MockTeamCategoryRow[] = Array.from(
    { length: teams },
    (_, teamIndex) => ({
      teamIndex,
      totals: teamTotals[teamIndex],
      ranks: Object.fromEntries(
        ALL_CATEGORY_IDS.map((categoryId) => [
          categoryId,
          ranksByCategory[categoryId][teamIndex],
        ]),
      ) as Record<CategoryId, number>,
      rosterSize: rosters[teamIndex].length,
    }),
  )

  return {
    teams: teamRows,
    categoryIds: ALL_CATEGORY_IDS,
  }
}
