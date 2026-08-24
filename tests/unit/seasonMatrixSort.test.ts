import { describe, expect, it } from "vitest"
import { sortTeamsByCategoryRank } from "@/lib/season/matrixSort"

describe("sortTeamsByCategoryRank", () => {
  const teamIndexes = [0, 1, 2, 3]
  const ranksByTeam = {
    0: 3,
    1: 1,
    2: 1,
    3: 4,
  }

  it("sorts asc with best rank first and stable tie-break by teamIndex", () => {
    expect(
      sortTeamsByCategoryRank({ teamIndexes, ranksByTeam, direction: "asc" }),
    ).toEqual([1, 2, 0, 3])
  })

  it("sorts desc with worst rank first and stable tie-break by teamIndex", () => {
    expect(
      sortTeamsByCategoryRank({ teamIndexes, ranksByTeam, direction: "desc" }),
    ).toEqual([3, 0, 1, 2])
  })

  it("does not mutate the input teamIndexes array", () => {
    const indexes = [0, 1, 2]
    const original = [...indexes]

    sortTeamsByCategoryRank({
      teamIndexes: indexes,
      ranksByTeam: { 0: 2, 1: 1, 2: 3 },
      direction: "asc",
    })

    expect(indexes).toEqual(original)
  })
})
