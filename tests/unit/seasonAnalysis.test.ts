import { describe, expect, it } from "vitest"
import { ALL_CATEGORY_IDS, defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import { analyzePerGameLeague, analyzeSeasonLeague } from "@/lib/season/analysis"
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

  it("leaves an IR player out of the team total", () => {
    const analysis = analyzeSeasonLeague(
      state(
        [
          player("starter", { PTS: 20 }),
          player("bench", { PTS: 10 }),
          player("hurt", { PTS: 30 }),
        ],
        [["starter", "bench", "hurt"]],
      ),
    )

    expect(categoryRows(analysis, "PTS")).toEqual([
      expect.objectContaining({ teamIndex: 0, raw: 30 }),
    ])
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

  it("ranks overall by sum of category ranks (roto-style)", () => {
    const analysis = analyzeSeasonLeague(
      state(
        [
          player("ace", {
            PTS: 30,
            REB: 12,
            AST: 10,
            STL: 2,
            BLK: 2,
            TPM: 3,
            TO: 1,
            FG_PCT: 0.5,
            FT_PCT: 0.85,
          }),
          player("mid", {
            PTS: 20,
            REB: 8,
            AST: 6,
            STL: 1,
            BLK: 1,
            TPM: 2,
            TO: 2,
            FG_PCT: 0.45,
            FT_PCT: 0.8,
          }),
          player("weak", {
            PTS: 10,
            REB: 4,
            AST: 2,
            STL: 0.5,
            BLK: 0.5,
            TPM: 1,
            TO: 3,
            FG_PCT: 0.4,
            FT_PCT: 0.75,
          }),
        ],
        [["ace"], ["mid"], ["weak"]],
      ),
    )

    expect(analysis.overall.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 0, rank: 1 }),
        expect.objectContaining({ teamIndex: 1, rank: 2 }),
        expect.objectContaining({ teamIndex: 2, rank: 3 }),
      ]),
    )
    const ace = analysis.overall.rows.find((row) => row.teamIndex === 0)!
    expect(ace.rankSum).toBeLessThan(
      analysis.overall.rows.find((row) => row.teamIndex === 2)!.rankSum,
    )
  })
})

describe("analyzePerGameLeague", () => {
  it("ranks counting stats by per-game rate instead of season volume", () => {
    const league = state(
      [
        { ...player("volume", { AST: 200, PTS: 1600, TO: 80 }), projectedGames: 80 },
        { ...player("rate", { AST: 100, PTS: 400, TO: 40 }), projectedGames: 20 },
      ],
      [["volume"], ["rate"]],
    )

    expect(categoryRows(analyzeSeasonLeague(league), "AST")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 0, rank: 1, raw: 200 }),
      ]),
    )
    expect(categoryRows(analyzePerGameLeague(league), "AST")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 1, rank: 1, raw: 5 }),
        expect.objectContaining({ teamIndex: 0, rank: 2, raw: 2.5 }),
      ]),
    )
    expect(categoryRows(analyzePerGameLeague(league), "TO")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 0, rank: 1, raw: 1 }),
      ]),
    )
  })

  it("keeps shooting percentages on the season volume ratio", () => {
    const league = state(
      [
        {
          ...player("efficient", { FG_PCT: 1, PTS: 800 }, { FGM: 10, FGA: 10 }),
          projectedGames: 40,
        },
        {
          ...player("low-volume", { FG_PCT: 0.5, PTS: 200 }, { FGM: 1, FGA: 2 }),
          projectedGames: 10,
        },
        {
          ...player("opponent", { FG_PCT: 0.4, PTS: 800 }, { FGM: 4, FGA: 10 }),
          projectedGames: 40,
        },
      ],
      [["efficient", "low-volume"], ["opponent"]],
    )

    const rateRank = (
      analysis: ReturnType<typeof analyzeSeasonLeague>,
    ) =>
      categoryRows(analysis, "FG_PCT").map(({ teamIndex, rank, raw }) => ({
        teamIndex,
        rank,
        raw,
      }))

    expect(rateRank(analyzePerGameLeague(league))).toEqual(
      rateRank(analyzeSeasonLeague(league)),
    )
  })

  it("leaves an IR player out and does not divide an already per-game line by 82", () => {
    const league = state(
      [
        player("rate", { AST: 8, PTS: 20 }),
        player("hurt", { AST: 40, PTS: 40 }),
        { ...player("season", { AST: 656, PTS: 1640 }), projectedGames: 82 },
      ],
      [["rate", "open", "hurt"], ["season"]],
    )

    expect(categoryRows(analyzePerGameLeague(league), "AST")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamIndex: 0, raw: 8 }),
        expect.objectContaining({ teamIndex: 1, raw: 8 }),
      ]),
    )
  })
})
