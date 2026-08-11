import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS, defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { analyzeSeasonLeague } from "@/lib/season/analysis"
import type {
  SeasonLeagueState,
  SeasonPlayer,
  SeasonRosterEntry,
} from "@/lib/season/types"

const projections = (
  overrides: Partial<Record<CategoryId, number>>,
): Record<CategoryId, number> =>
  Object.fromEntries(
    ALL_CATEGORY_IDS.map((categoryId) => [categoryId, overrides[categoryId] ?? 0]),
  ) as Record<CategoryId, number>

const player = (
  id: string,
  projectionOverrides: Partial<Record<CategoryId, number>>,
  shootingOverrides: Partial<SeasonPlayer["shooting"]> = {},
): SeasonPlayer => ({
  id,
  name: id,
  projections: projections(projectionOverrides),
  shooting: {
    FGM: 0,
    FGA: 0,
    FTM: 0,
    FTA: 0,
    ...shootingOverrides,
  },
})

const entries = (...playerIds: string[]): SeasonRosterEntry[] =>
  playerIds.map((playerId, index) => ({
    slot: index === 1 ? "BE" : index === 2 ? "IL" : "PG",
    playerId,
  }))

const state = (
  players: SeasonPlayer[],
  teamPlayerIds: string[][],
): SeasonLeagueState => ({
  name: "Test league",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: teamPlayerIds.map((playerIds, teamIndex) => ({
    teamIndex,
    name: `Team ${teamIndex + 1}`,
    entries: entries(...playerIds),
  })),
  players,
  availablePlayerIds: [],
  waiverOrder: teamPlayerIds.map((_, teamIndex) => teamIndex),
  source: "manual",
})

const categoryRows = (
  analysis: ReturnType<typeof analyzeSeasonLeague>,
  categoryId: CategoryId,
) => analysis.byCategory.find((category) => category.categoryId === categoryId)!.rows

describe("analyzeSeasonLeague", () => {
  it("ranks a team with stacked AST including bench players first", () => {
    const analysis = analyzeSeasonLeague(
      state(
        [
          player("starter", { AST: 12 }),
          player("bench", { AST: 10 }),
          player("opponent", { AST: 15 }),
        ],
        [["starter", "bench"], ["opponent"]],
      ),
    )

    expect(categoryRows(analysis, "AST")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 0, rank: 1, raw: 22 }),
      ]),
    )
  })

  it("ranks lower turnover totals first", () => {
    const analysis = analyzeSeasonLeague(
      state(
        [player("low", { TO: 2 }), player("high", { TO: 6 })],
        [["low"], ["high"]],
      ),
    )

    expect(categoryRows(analysis, "TO")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 0, rank: 1, raw: 2 }),
      ]),
    )
  })

  it("calculates FG_PCT from shooting volume when every player has attempts", () => {
    const analysis = analyzeSeasonLeague(
      state(
        [
          player("efficient", { FG_PCT: 1 }, { FGM: 10, FGA: 10 }),
          player("low-volume", { FG_PCT: 0.5 }, { FGM: 1, FGA: 2 }),
          player("opponent", { FG_PCT: 0.4 }, { FGM: 4, FGA: 10 }),
        ],
        [["efficient", "low-volume"], ["opponent"]],
      ),
    )

    expect(categoryRows(analysis, "FG_PCT")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teamIndex: 0,
          raw: 11 / 12,
        }),
      ]),
    )
  })
})
