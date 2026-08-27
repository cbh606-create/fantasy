import { describe, expect, it } from "vitest"
import samplePlayers from "../../data/fixtures/players-sample.json"
import { defaultCategorySettings } from "@/lib/domain/categories"
import { buildEmptyBoard } from "@/lib/domain/snake"
import type {
  CategoryId,
  LeagueSettings,
  LeagueState,
  Player,
} from "@/lib/domain/types"
import { runDraftSimulation } from "@/lib/sim/engine"

const rosterSlots: LeagueSettings["rosterSlots"] = ["PG", "SG", "SF"]

const createSettings = (
  overrides: Partial<LeagueSettings> = {},
): LeagueSettings => ({
  teams: 12,
  draftType: "snake",
  rosterSlots,
  categories: defaultCategorySettings(),
  userPickSlot: 1,
  puntCategoryIds: [],
  focusCategoryIds: [],
  rounds: rosterSlots.length,
  ...overrides,
})

const createState = (
  settings = createSettings(),
  players: Player[] = samplePlayers as Player[],
): LeagueState => ({
  settings,
  board: buildEmptyBoard(settings.teams, settings.rounds),
  players,
  source: "manual",
  perspectiveTeamIndex: settings.userPickSlot - 1,
})

const zeroProjections = (): Record<CategoryId, number> => ({
  FG_PCT: 0,
  FT_PCT: 0,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
})

describe("runDraftSimulation", () => {
  it("returns an identical next-pick order for a fixed seed", () => {
    const input = {
      state: createState(),
      simCount: 4,
      seed: 71,
    }

    const first = runDraftSimulation(input)
    const second = runDraftSimulation(input)

    expect(first.nextPicks.map(({ playerId }) => playerId)).toEqual(
      second.nextPicks.map(({ playerId }) => playerId),
    )
  })

  it("returns at most three next picks quickly with fastRecommendations", () => {
    const result = runDraftSimulation({
      state: createState(),
      simCount: 8,
      seed: 11,
      fastRecommendations: true,
    })

    expect(result.nextPicks.length).toBeGreaterThan(0)
    expect(result.nextPicks.length).toBeLessThanOrEqual(3)
    expect(result.meta.latencyMs).toBeLessThan(5_000)
  })

  it("fills only the remaining user slots in a mid-draft state", () => {
    const state = createState()
    state.board.picks[0].playerId = state.players[0].id

    const result = runDraftSimulation({
      state,
      simCount: 2,
      seed: 5,
    })

    expect(result.topCombinations).not.toHaveLength(0)
    expect(result.topCombinations[0].playerIds).toHaveLength(
      state.settings.rounds - 1,
    )
    expect(result.topCombinations[0].playerIds).not.toContain(state.players[0].id)
  })

  it("changes the top recommendation when steals are punted versus focused", () => {
    const craftedPlayers = (samplePlayers as Player[]).map((player) => ({
      ...player,
      projections: zeroProjections(),
    }))
    craftedPlayers[0].projections.STL = 100
    craftedPlayers[1].projections.PTS = 100

    const puntResult = runDraftSimulation({
      state: createState(
        createSettings({ puntCategoryIds: ["STL"] }),
        craftedPlayers,
      ),
      simCount: 4,
      seed: 19,
    })
    const focusResult = runDraftSimulation({
      state: createState(
        createSettings({ focusCategoryIds: ["STL"] }),
        craftedPlayers,
      ),
      simCount: 4,
      seed: 19,
    })

    expect(puntResult.nextPicks[0].playerId).toBe(craftedPlayers[1].id)
    expect(focusResult.nextPicks[0].playerId).toBe(craftedPlayers[0].id)
  })

  it("returns no next-pick recommendations when it is not the user turn", () => {
    const state = createState()
    state.board.currentOverall = 2

    const result = runDraftSimulation({
      state,
      simCount: 2,
      seed: 23,
    })

    expect(result.nextPicks).toEqual([])
    expect(Object.values(result.categoryOutlook).some((value) => value > 0)).toBe(
      true,
    )
  })

  it("keeps unconstrained aggregates isolated from force-pick input", () => {
    const state = createState()
    const input = {
      state,
      simCount: 4,
      seed: 31,
    }

    const unconstrained = runDraftSimulation(input)
    const withUnrelatedForcePick = runDraftSimulation({
      ...input,
      forcePickPlayerId: state.players[11].id,
    })

    expect(withUnrelatedForcePick.topCombinations).toEqual(
      unconstrained.topCombinations,
    )
    expect(withUnrelatedForcePick.categoryOutlook).toEqual(
      unconstrained.categoryOutlook,
    )
  })

  it("returns empty aggregates when no players remain", () => {
    const state = createState()
    state.board.picks.forEach((pick, index) => {
      pick.playerId = state.players[index].id
    })

    expect(() =>
      runDraftSimulation({
        state,
        simCount: 0,
        seed: 3,
      }),
    ).not.toThrow()

    const result = runDraftSimulation({
      state,
      simCount: 0,
      seed: 3,
    })

    expect(result.nextPicks).toEqual([])
    expect(result.topCombinations).toEqual([])
    expect(Object.values(result.categoryOutlook).some((value) => value > 0)).toBe(
      true,
    )
    expect(result.meta.simCount).toBe(1)
  })

  it("recommends top projection talent at 1.01 on an empty board (fast path)", () => {
    const star = (
      id: string,
      adp: number,
      overrides: Partial<Record<CategoryId, number>>,
    ): Player => ({
      id,
      name: id,
      positions: ["C"],
      adp,
      projections: {
        FG_PCT: 0.48,
        FT_PCT: 0.8,
        TPM: 100,
        REB: 400,
        AST: 300,
        STL: 60,
        BLK: 40,
        TO: 180,
        PTS: 1400,
        ...overrides,
      },
    })

    const players = [
      star("durant", 1, { PTS: 1693, REB: 400, AST: 300, BLK: 70 }),
      star("jokic", 14, {
        FG_PCT: 0.58,
        PTS: 2144,
        REB: 940,
        AST: 747,
        STL: 100,
        BLK: 60,
      }),
      star("wemby", 20, {
        PTS: 1755,
        REB: 800,
        AST: 280,
        BLK: 250,
        STL: 90,
      }),
      star("curry", 25, { PTS: 1810, TPM: 320, AST: 400, REB: 350 }),
      ...Array.from({ length: 20 }, (_, index) =>
        star(`filler-${index}`, 40 + index, {
          PTS: 900,
          REB: 300,
          AST: 200,
        }),
      ),
    ]

    const result = runDraftSimulation({
      state: createState(createSettings({ rounds: 3 }), players),
      simCount: 20,
      seed: 42,
      fastRecommendations: true,
    })

    expect(result.nextPicks.length).toBeGreaterThan(0)
    expect(["jokic", "wemby"]).toContain(result.nextPicks[0].playerId)
    expect(result.nextPicks[0].playerId).not.toBe("durant")
  })
})
