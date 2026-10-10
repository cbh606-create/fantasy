import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { MatchupBoard } from "@/lib/matchup/types"
import {
  buildWinnerStreamRecipes,
  compareStreamerRank,
  playerAddKinds,
  playerSlotGroup,
  winnerPriorHits,
  winnerStreamHint,
  type WinnerStreamAddEvent,
  type WinnerStreamMatchupBox,
} from "@/lib/matchup/winnerStreamPrior"
import type { SeasonPlayer } from "@/lib/season/types"

const shooting = { FGM: 0, FGA: 0, FTM: 0, FTA: 0 }

const projections = (
  over: Partial<Record<CategoryId, number>>,
): Record<CategoryId, number> => ({
  FG_PCT: 0.45,
  FT_PCT: 0.8,
  TPM: 10,
  REB: 10,
  AST: 10,
  STL: 10,
  BLK: 10,
  TO: 10,
  PTS: 10,
  ...over,
})

const player = (
  id: string,
  over: Partial<SeasonPlayer> & {
    projections?: Record<CategoryId, number>
  },
): SeasonPlayer => ({
  id,
  name: id,
  shooting,
  projections: over.projections ?? projections({}),
  ...over,
})

const stlGuard = player("stl-g", {
  positions: ["PG"],
  projections: projections({ STL: 200, BLK: 20, PTS: 80 }),
})

const volumeScorer = player("pts-f", {
  positions: ["SF"],
  projections: projections({ PTS: 2000, STL: 20, BLK: 10 }),
})

const completedWeek = (
  scoringPeriodId: number,
  homeWins: number,
  awayWins: number,
  homeOutcomes: WinnerStreamMatchupBox["home"]["outcomes"],
): WinnerStreamMatchupBox => ({
  scoringPeriodId,
  complete: true,
  home: {
    espnTeamId: 1,
    catWins: homeWins,
    outcomes: homeOutcomes,
  },
  away: {
    espnTeamId: 2,
    catWins: awayWins,
    outcomes: {},
  },
})

const winnerStlWeek = completedWeek(1, 6, 3, { STL: "L", PTS: "W" })

const addBy = (
  espnTeamId: number,
  addedPlayerId: string,
  scoringPeriodId = 1,
): WinnerStreamAddEvent => ({
  scoringPeriodId,
  espnTeamId,
  addedPlayerId,
})

const recipesFrom = (
  events: WinnerStreamAddEvent[],
  matchups: WinnerStreamMatchupBox[],
  players: SeasonPlayer[],
  currentScoringPeriodId = 9,
) =>
  buildWinnerStreamRecipes({
    events,
    matchups,
    players,
    enabledCats: ALL_CATEGORY_IDS,
    currentScoringPeriodId,
  })

const boardWith = (
  outcomes: Partial<Record<CategoryId, MatchupBoard["categories"][number]["outcome"]>>,
): MatchupBoard => ({
  categories: ALL_CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    you: 0,
    opp: 0,
    outcome: outcomes[categoryId] ?? "W",
    winProb: 0.5,
  })),
  wins: 0,
  losses: 0,
  ties: 0,
  projectedCatWins: 0,
})

describe("playerSlotGroup", () => {
  it("prefers G, then F, else C", () => {
    expect(playerSlotGroup(player("g", { positions: ["PG", "SF"] }))).toBe("G")
    expect(playerSlotGroup(player("f", { positions: ["PF"] }))).toBe("F")
    expect(playerSlotGroup(player("c", { positions: ["C"] }))).toBe("C")
  })
})

describe("playerAddKinds", () => {
  it("keeps a second counting cat within 15% of the top", () => {
    const dual = player("dual", {
      projections: projections({ STL: 100, BLK: 90, PTS: 10 }),
    })
    expect(playerAddKinds(dual, ALL_CATEGORY_IDS)).toEqual(["STL", "BLK"])
  })
})

describe("buildWinnerStreamRecipes", () => {
  it("keeps a winner add of a STL-heavy G when that winner lost STL", () => {
    const recipes = recipesFrom(
      [addBy(1, "stl-g"), addBy(1, "stl-g")],
      [winnerStlWeek, completedWeek(2, 5, 4, { STL: "L" })],
      [stlGuard],
    )

    expect(recipes).toContainEqual(
      expect.objectContaining({
        situationCat: "STL",
        addKind: "STL",
        addGroup: "G",
      }),
    )
  })

  it("ignores the losing team's add", () => {
    const recipes = recipesFrom(
      [addBy(2, "stl-g"), addBy(2, "stl-g")],
      [winnerStlWeek, completedWeek(2, 5, 4, { STL: "W" })],
      [stlGuard],
    )

    expect(recipes).toEqual([])
  })

  it("excludes the current incomplete week", () => {
    const recipes = recipesFrom(
      [addBy(1, "stl-g", 3), addBy(1, "stl-g", 3)],
      [
        {
          scoringPeriodId: 3,
          complete: false,
          home: {
            espnTeamId: 1,
            catWins: 6,
            outcomes: { STL: "L" },
          },
          away: { espnTeamId: 2, catWins: 1, outcomes: {} },
        },
      ],
      [stlGuard],
      3,
    )

    expect(recipes).toEqual([])
  })

  it("returns no recipes when history is empty", () => {
    expect(recipesFrom([], [], [stlGuard])).toEqual([])
  })
})

describe("winnerPriorHits and rank", () => {
  const recipes = [
    {
      situationCat: "STL" as const,
      addKind: "STL" as const,
      addGroup: "G" as const,
      count: 5,
    },
  ]
  const trailingStl = boardWith({ STL: "L" })

  it("scores a matching FA on a trailing cat", () => {
    expect(winnerPriorHits(stlGuard, trailingStl, recipes)).toBeGreaterThan(0)
    expect(winnerPriorHits(volumeScorer, trailingStl, recipes)).toBe(0)
  })

  it("keeps a strictly larger delta first even when only the smaller delta matches", () => {
    expect(
      compareStreamerRank(
        { delta: 0.12, hits: 0, index: 1 },
        { delta: 0.1, hits: 1, index: 0 },
      ),
    ).toBeLessThan(0)
  })

  it("breaks equal deltas in favor of the recipe match", () => {
    expect(
      compareStreamerRank(
        { delta: 0.15, hits: 1, index: 1 },
        { delta: 0.15, hits: 0, index: 0 },
      ),
    ).toBeLessThan(0)
  })
})

describe("winnerStreamHint", () => {
  const recipes = [
    {
      situationCat: "STL" as const,
      addKind: "STL" as const,
      addGroup: "G" as const,
      count: 5,
    },
    {
      situationCat: "STL" as const,
      addKind: "BLK" as const,
      addGroup: "G" as const,
      count: 3,
    },
  ]

  it("lists streamed cats when recipes hit your L/T board", () => {
    expect(winnerStreamHint(boardWith({ STL: "L" }), recipes)).toBe(
      "Winners here streamed STL/BLK when trailing those cats",
    )
  })

  it("omits the line when recipes exist but none match", () => {
    expect(winnerStreamHint(boardWith({ PTS: "L" }), recipes)).toBeNull()
  })

  it("omits the line when prior was skipped", () => {
    expect(winnerStreamHint(boardWith({ STL: "L" }), [])).toBeNull()
  })
})
