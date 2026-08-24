export type SortDirection = "asc" | "desc"

export type SortTeamsByCategoryRankInput = {
  teamIndexes: number[]
  ranksByTeam: Record<number, number>
  direction: SortDirection
}

export const sortTeamsByCategoryRank = ({
  teamIndexes,
  ranksByTeam,
  direction,
}: SortTeamsByCategoryRankInput): number[] =>
  [...teamIndexes].sort((left, right) => {
    const rankDifference = ranksByTeam[left] - ranksByTeam[right]
    const orderedDifference = direction === "asc" ? rankDifference : -rankDifference

    return orderedDifference || left - right
  })
