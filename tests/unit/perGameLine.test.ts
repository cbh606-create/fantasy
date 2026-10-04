import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer, SeasonSlot } from "@/lib/season/types"
import { perGameTeamLines } from "@/lib/trade/perGameLine"

const zeros = (): Record<CategoryId, number> => ({
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 0,
  REB: 0,
  AST: 0,
  STL: 0,
  BLK: 0,
  TO: 0,
  PTS: 0,
})

const player = (
  id: string,
  projections: Partial<Record<CategoryId, number>>,
  games?: number,
  shooting?: SeasonPlayer["shooting"],
): SeasonPlayer => ({
  id,
  name: id,
  projectedGames: games,
  projections: { ...zeros(), ...projections },
  shooting: shooting ?? { FGM: 82, FGA: 164, FTM: 82, FTA: 100 },
})

const stateWith = (
  entries: { slot: SeasonSlot, playerId: string | null }[],
  players: SeasonPlayer[],
): SeasonLeagueState => ({
  name: "Per game",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: [{ teamIndex: 0, name: "Mine", entries }],
  players,
  availablePlayerIds: [],
  waiverOrder: [0],
  source: "manual",
})

describe("perGameTeamLines", () => {
  it("sums counting stats after dividing each player by that player's games", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "short" },
        { slot: "UTIL", playerId: "full" },
      ],
      [
        player("short", { PTS: 820 }, 41),
        player("full", { PTS: 820 }, 82),
      ],
    )

    expect(perGameTeamLines(state)[0].totals.PTS).toBeCloseTo(30)
  })

  it("uses 82 games when projected games are missing", () => {
    const state = stateWith(
      [{ slot: "UTIL", playerId: "plain" }],
      [player("plain", { PTS: 820 })],
    )

    expect(perGameTeamLines(state)[0].totals.PTS).toBeCloseTo(10)
  })

  it("includes an IL player and ignores an empty slot", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "active" },
        { slot: "IL", playerId: "hurt" },
        { slot: "BE", playerId: null },
      ],
      [player("active", { REB: 82 }, 82), player("hurt", { REB: 164 }, 82)],
    )

    expect(perGameTeamLines(state)[0].totals.REB).toBeCloseTo(3)
  })

  it("builds FG% from total makes divided by total attempts", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "one" },
        { slot: "UTIL", playerId: "two" },
      ],
      [
        player("one", {}, 82, { FGM: 82, FGA: 164, FTM: 0, FTA: 1 }),
        player("two", {}, 41, { FGM: 41, FGA: 41, FTM: 0, FTA: 1 }),
      ],
    )

    expect(perGameTeamLines(state)[0].totals.FG_PCT).toBeCloseTo(123 / 205)
  })

  it("ignores percentage projections when summed attempts are nonzero", () => {
    const state = stateWith(
      [
        { slot: "UTIL", playerId: "shooter" },
        { slot: "UTIL", playerId: "empty" },
      ],
      [
        player("shooter", {}, 82, { FGM: 82, FGA: 164, FTM: 0, FTA: 0 }),
        player("empty", { FG_PCT: 0.1 }, 82, { FGM: 0, FGA: 0, FTM: 0, FTA: 0 }),
      ],
    )

    expect(perGameTeamLines(state)[0].totals.FG_PCT).toBeCloseTo(0.5)
  })

  it("averages percentage projections when the roster has no shooting volume", () => {
    const shooter = player("bare", { FG_PCT: 0.4 }, 82, { FGM: 0, FGA: 0, FTM: 0, FTA: 0 })
    const state = stateWith([{ slot: "UTIL", playerId: "bare" }], [shooter])

    expect(perGameTeamLines(state)[0].totals.FG_PCT).toBeCloseTo(0.4)
  })
})
