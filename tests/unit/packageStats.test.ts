import { describe, expect, it } from "vitest"
import { defaultCategorySettings } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import type { SeasonLeagueState, SeasonPlayer } from "@/lib/season/types"
import { tradeStatRows } from "@/lib/trade/packageStats"
import type { TradeSuggestion } from "@/lib/trade/types"

const base = {
  FG_PCT: 0.5,
  FT_PCT: 0.8,
  TPM: 1,
  REB: 4,
  AST: 3,
  STL: 1,
  BLK: 1,
  TO: 2,
  PTS: 10,
} satisfies Record<CategoryId, number>

const player = (
  id: string,
  name: string,
  projections: Partial<Record<CategoryId, number>>,
  shooting: SeasonPlayer["shooting"],
): SeasonPlayer => ({
  id,
  name,
  projections: { ...base, ...projections },
  shooting,
})

const suggestion = (overrides: Partial<TradeSuggestion> = {}): TradeSuggestion => ({
  id: "2:1|1|give|get",
  shape: "2:1",
  counterpartyTeamIndex: 1,
  givePlayerIds: ["give"],
  getPlayerIds: ["get"],
  reasons: [],
  mutualScore: 1,
  youGains: [],
  youImproved: [],
  themGains: [],
  youWorsened: [],
  themWorsened: [],
  youStrengthsHeld: [],
  themStrengthsHeld: [],
  ...overrides,
})

const stateOf = (players: SeasonPlayer[]): SeasonLeagueState => ({
  name: "Stats league",
  season: 2026,
  categories: defaultCategorySettings(),
  perspectiveTeamIndex: 0,
  teams: [
    {
      teamIndex: 0,
      name: "My Team",
      entries: players.filter((entry) => entry.id.startsWith("you") || entry.id === "give")
        .map((entry) => ({ slot: "UTIL" as const, playerId: entry.id })),
    },
    {
      teamIndex: 1,
      name: "Rivals",
      entries: players.filter((entry) => entry.id.startsWith("them") || entry.id === "get")
        .map((entry) => ({ slot: "UTIL" as const, playerId: entry.id })),
    },
  ],
  players,
  availablePlayerIds: [],
  waiverOrder: [0, 1],
  source: "manual",
})

describe("tradeStatRows", () => {
  const give = player("give", "Sender", { PTS: 30, FG_PCT: 0.5 }, {
    FGM: 5, FGA: 10, FTM: 4, FTA: 5,
  })
  const keep = player("you-keep", "Keeper", { PTS: 20, FG_PCT: 0.4 }, {
    FGM: 4, FGA: 10, FTM: 3, FTA: 5,
  })
  const get = player("get", "Receiver", { PTS: 16, FG_PCT: 0.8 }, {
    FGM: 8, FGA: 10, FTM: 4, FTA: 5,
  })
  const state = stateOf([give, keep, get])

  it("sums counting stats and combines shooting for a package", () => {
    const rows = tradeStatRows(state, suggestion())
    const send = rows.find((row) => row.id === "send-total")
    const receive = rows.find((row) => row.id === "receive-total")

    const partner = player("give-2", "Partner", { PTS: 10, FG_PCT: 0.8 }, {
      FGM: 8, FGA: 10, FTM: 4, FTA: 5,
    })
    const combined = tradeStatRows(
      stateOf([give, partner, keep, get]),
      suggestion({ givePlayerIds: ["give", "give-2"] }),
    )
    const combinedSend = combined.find((row) => row.id === "send-total")

    expect(rows.find((row) => row.id === "send-give")?.values.PTS).toBe(30)
    expect(rows.find((row) => row.id === "send-give")?.values.FG_PCT).toBeCloseTo(0.5)
    expect(rows.find((row) => row.id === "send-give")?.values.FT_PCT).toBeCloseTo(0.8)
    expect(send?.values.PTS).toBe(30)
    expect(send?.values.FG_PCT).toBeCloseTo(0.5)
    expect(combinedSend?.values.PTS).toBe(40)
    expect(combinedSend?.values.FG_PCT).toBeCloseTo(13 / 20)
    expect(receive?.values.PTS).toBe(16)
    expect(receive?.values.FG_PCT).toBeCloseTo(0.8)

    const mismatched = player("give", "Sender", { FG_PCT: 0.41, FT_PCT: 0.91 }, {
      FGM: 5, FGA: 10, FTM: 4, FTA: 5,
    })
    const matched = tradeStatRows(stateOf([mismatched, keep, get]), suggestion())
    const matchedPlayer = matched.find((row) => row.id === "send-give")
    const matchedTotal = matched.find((row) => row.id === "send-total")

    expect(matchedPlayer?.values.FG_PCT).toBeCloseTo(0.5)
    expect(matchedPlayer?.values.FT_PCT).toBeCloseTo(0.8)
    expect(matchedTotal?.values.FG_PCT).toBeCloseTo(matchedPlayer?.values.FG_PCT ?? 0)
    expect(matchedTotal?.values.FT_PCT).toBeCloseTo(matchedPlayer?.values.FT_PCT ?? 0)

    const jokic = player("give", "Nikola Jokic", { PTS: 30 }, {
      FGM: 5, FGA: 10, FTM: 4, FTA: 5,
    })
    const dosunmu = player("give-2", "Ayo Dosunmu", { PTS: 10 }, {
      FGM: 4, FGA: 10, FTM: 3, FTA: 5,
    })
    const durant = player("get", "Kevin Durant", { PTS: 16 }, {
      FGM: 8, FGA: 10, FTM: 4, FTA: 5,
    })
    const valued = tradeStatRows(
      stateOf([jokic, dosunmu, keep, durant]),
      suggestion({ givePlayerIds: ["give", "give-2"] }),
    )

    expect(valued.find((row) => row.id === "send-give")?.value).toBeCloseTo(1.578332)
    expect(valued.find((row) => row.id === "send-give-2")?.value).toBeCloseTo(0.299764)
    expect(valued.find((row) => row.id === "receive-get")?.value).toBeCloseTo(0.780346)
    expect(valued.find((row) => row.id === "send-total")?.value).toBeCloseTo(1.578332 + 0.299764)
    expect(valued.find((row) => row.id === "receive-total")?.value).toBeCloseTo(0.780346)
    expect(valued.find((row) => row.id === "you-delta")?.label).toBe("Difference")
    expect(valued.find((row) => row.id === "you-delta")?.value)
      .toBeCloseTo(0.780346 - (1.578332 + 0.299764))
  })

  it("lists your players, their players, both totals, then your team change", () => {
    const rows = tradeStatRows(state, suggestion({ droppedPlayerId: "you-keep" }))
    const you = rows.find((row) => row.id === "you-delta")

    expect(rows.map((row) => row.id)).toEqual([
      "send-give",
      "receive-get",
      "send-total",
      "receive-total",
      "you-delta",
    ])
    expect(rows.find((row) => row.id === "send-total")?.side).toBe("you")
    expect(rows.find((row) => row.id === "receive-total")?.side).toBe("them")
    expect(you?.signed).toBe(true)
    expect(you?.side).toBe("you")
    expect(you?.values.PTS).toBe(-34)
  })
})
