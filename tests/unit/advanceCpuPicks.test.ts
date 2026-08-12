import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { LeagueState, Player } from "@/lib/domain/types"
import {
  advanceCpuPicksUntilUserTurn,
  advanceOneCpuPick,
} from "@/lib/sim/advanceCpuPicks"

const projections = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 2,
  REB: 7,
  AST: 5,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 20,
}

const createPlayer = (id: string, adp: number): Player => ({
  id,
  name: id,
  positions: ["PG"],
  projections,
  adp,
})

const createState = (overrides: Partial<LeagueState> = {}): LeagueState => ({
  settings: {
    teams: 4,
    draftType: "snake",
    rosterSlots: ["PG", "SG"],
    categories: defaultCategorySettings(),
    userPickSlot: 2,
    puntCategoryIds: [],
    focusCategoryIds: [],
    rounds: 2,
  },
  board: {
    picks: [],
    currentOverall: 1,
  },
  players: Array.from({ length: 12 }, (_, index) =>
    createPlayer(`p${index + 1}`, index + 1),
  ),
  source: "manual",
  perspectiveTeamIndex: 1,
  ...overrides,
})

describe("advanceCpuPicksUntilUserTurn", () => {
  it("fills opponent picks until the next perspective turn", () => {
    const afterUserPick: LeagueState = {
      ...createState(),
      board: {
        picks: [
          {
            overall: 1,
            round: 1,
            teamIndex: 0,
            playerId: "p1",
          },
          {
            overall: 2,
            round: 1,
            teamIndex: 1,
            playerId: "p2",
          },
        ],
        currentOverall: 3,
      },
    }

    const advanced = advanceCpuPicksUntilUserTurn(afterUserPick, 42)

    // Snake 4 teams: after pick 2 (user), fill 3–6, stop at 7 (user again)
    for (const overall of [3, 4, 5, 6]) {
      expect(
        advanced.board.picks.find((pick) => pick.overall === overall)?.playerId,
      ).toBeTruthy()
    }
    expect(advanced.board.picks.find((pick) => pick.overall === 7)?.playerId).toBeNull()
    expect(advanced.board.currentOverall).toBe(7)
    expect(
      advanced.board.picks.find((pick) => pick.overall === 7)?.teamIndex,
    ).toBe(1)
  })

  it("fills opening opponent picks before the first user turn", () => {
    const advanced = advanceCpuPicksUntilUserTurn(createState(), 7)

    expect(advanced.board.picks.find((pick) => pick.overall === 1)?.playerId).toBeTruthy()
    expect(advanced.board.picks.find((pick) => pick.overall === 2)?.playerId).toBeNull()
    expect(advanced.board.currentOverall).toBe(2)
  })

  it("is a no-op when it is already the perspective turn", () => {
    const onUserTurn = createState({
      board: {
        picks: [
          {
            overall: 1,
            round: 1,
            teamIndex: 0,
            playerId: "p1",
          },
        ],
        currentOverall: 2,
      },
    })

    const advanced = advanceCpuPicksUntilUserTurn(onUserTurn, 9)

    expect(advanced.board.currentOverall).toBe(2)
    expect(advanced.board.picks.find((pick) => pick.overall === 2)?.playerId).toBeNull()
  })
})

describe("advanceOneCpuPick", () => {
  it("applies a single opponent pick and returns null on the user turn", () => {
    const afterOne = advanceOneCpuPick(createState(), 11)

    expect(afterOne).not.toBeNull()
    expect(afterOne!.board.picks.find((pick) => pick.overall === 1)?.playerId)
      .toBeTruthy()
    expect(afterOne!.board.currentOverall).toBe(2)
    expect(advanceOneCpuPick(afterOne!, 12)).toBeNull()
  })
})
